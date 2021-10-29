<p align="center">
<img src="./docs/logo.svg" width="100%" style="max-width: 900px" />
<a  href="https://github.com/prostojs/tree/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-gray?style=for-the-badge" />
</a>
    <img src="https://img.shields.io/badge/Dependencies-0-gray?style=for-the-badge" />
</p>

Light and easy **output in tree** library.
```
ProstoTree
└── Light and easy
```

## Install

npm: `npm install @prostojs/tree`

Via CDN:
```
<script src="https://unpkg.com/@prostojs/dye"></script>
<script src="https://unpkg.com/@prostojs/tree"></script>
```

## Usage

```js
const { ProstoTree } = require('@prostojs/tree')

const tree = new ProstoTree()

tree.print({
    label: 'root node',
    children: [
        { label: 'node with label' },
        'some node',
        {
            label: 'big',
            children: [
                'more',
                'nodes',
                { label: 'nested', children: ['deep', 'deep2'] },
                'nested ends',
            ],
        },
        'small',
    ],
})
```
<img src="./docs/tree.png" style="max-width: 500px" />

### Options

```js
const options = {
    label: '<name of prop with label>',
    children: '<name of prop with array of children>',
    renderLabel: (node) => '<render the node content yourself>',
    branchWidth: 2, // the horizontal length of branch tail
    branches: {
        vLine: '│',     // vertical line character
        hLine: '─',     // horizontal line character (repeated <branchWidth> times)
        end: '└',       // ending branch character
        middle: '├',    // middle branch character
    }
}

const tree = new ProstoTree(options)

const stringResult = tree.render()
tree.print() // console.log
```
