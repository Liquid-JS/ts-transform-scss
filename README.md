# TypeScript transformer to inline compiled SASS / SCSS

Use it with [ttypescript](https://github.com/cevek/ttypescript):

```json
{
    "compilerOptions": {
        "plugins": [
            {
                "transform": "@liquid-js/ts-transform-scss/transform.js"
            }
        ]
    }
}
```

```ts
render() {
    return html`
        <style>
            :inline {
                content: "./source.scss";
            }
        </style>
    `
}
```

### Prefix CSS

See [autoprefixer](https://github.com/postcss/autoprefixer) to configure browser compatibility level.
