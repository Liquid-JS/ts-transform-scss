import * as autoprefixer from 'autoprefixer'
import * as deasync from 'deasync'
import * as md5 from 'md5-file'
import * as sass from 'node-sass'
import * as path from 'path'
import * as postcss from 'postcss'
import * as csso from 'postcss-csso'
import * as ts from 'typescript'

const cssProcessor = postcss([autoprefixer, csso])

const inlineRegex = /:inline[\n\r\s]*\{[\n\r\s]*content:[\n\r\s]*("([^"]|\\")*"|'([^']|\\')*');[\n\r\s]*\}/g
const inlineRegexCap = /content:[\n\r\s]*("([^"]|\\")*"|'([^']|\\')*');/

function fsp(file, outFile) {
    return new Promise((res, rej) => sass.render({
        file,
        outFile,
        // sourceMap: true
    }, (err2, result) => {
        if (err2)
            return rej(err2)

        res({
            css: result.css.toString('utf8'),
            // map: result.map.toString('utf8')
        })
    }))
        .then(({
            css,
            // map
        }) => cssProcessor.process(css, {
            from: file,
            /*map: {
                prev: map,
                inline: true
            }*/
        }))
        .then(res => res.css)
}

function dea<T>(promise: Promise<T>) {
    return deasync((cb: (err, res: T) => void) => {
        promise
            .then(r => cb(null, r))
            .catch(e => cb(e, null))
    })()
}

const hashes: { [file: string]: string } = {}
const cache: { [file: string]: Promise<{ [key: string]: string }> } = {}

export default function (_program: ts.Program, _config: any) {
    return (ctx: ts.TransformationContext) => {

        return (sourceFile: ts.SourceFile) => {
            const dir = path.dirname(sourceFile.fileName)

            function visitor(node: ts.Node) {
                if ('text' in node && node['text'].match(inlineRegex)) {
                    const matches = node['text'].match(inlineRegex) || []
                    const resolved = {}
                    matches
                        .map(match => {
                            const m = match.match(inlineRegexCap)

                            if (!m)
                                return {
                                    match,
                                    path: ''
                                }

                            let p = m[1].trim()

                            // Remove quotes
                            p = p.replace(new RegExp(`\\\\${m[1].charAt(0)}`, 'g'), m[1].charAt(0))
                            p = path.normalize(p.substr(1, p.length - 2))

                            if (!path.isAbsolute(p))
                                p = path.normalize(path.join(dir, p))

                            return {
                                match,
                                p
                            }
                        })
                        .forEach(({ match, p }) => {
                            if (!(p in resolved))
                                resolved[p] = []

                            resolved[p].push(match)
                        })

                    const promise = Promise.all(
                        Object.keys(resolved)
                            .map(file => {
                                const hash = md5.sync(file)
                                if (file in cache) {
                                    if (!(file in hashes) || hashes[file] != hash)
                                        delete cache[file]
                                }

                                hashes[file] = hash

                                if (!(file in cache) || !cache[file])
                                    cache[file] = fsp(file, sourceFile.fileName)
                                        .catch(_err => '')
                                        .then(css => ({ [file]: css }))

                                return cache[file]
                            })
                    )
                        .then(values => Object.assign({}, ...values))
                        .catch(() => ({ '': '' }))

                    const result: { [file: string]: string } = dea(promise)
                    const replacements: { [match: string]: string } = {}
                    Object.keys(result)
                        .forEach(file =>
                            resolved[file].forEach(match =>
                                replacements[match] = result[file]
                            )
                        )

                    const node2 = ts.createNode(node['kind'])
                    node2.parent = node['parent']
                    node2['text'] = node['text'].replace(inlineRegex, match => replacements[match] || '')

                    return node2
                }

                return ts.visitEachChild(node, visitor, ctx)
            }

            return ts.visitEachChild(sourceFile, visitor, ctx)
        }
    }
}
