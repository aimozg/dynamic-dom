# DynamicDom

Lightweight DOM attributes-based UI framework. Inspired by [Vue.js](https://vuejs.org/).

## Installation

Add `dist/index.js`.

(TODO build scripts and minified/modular version) 

## Usage

1. Write a DOM with `dd-` attributes
2. Compile with `DD.compile(rootNode)`
3. Evaluate with `DD.evaluate(rootNode[, thisArg])`
4. Evaluate again, when needed.

### Example

(See `demo/demo.html`).

```html

<main>
    <div id="main">
        <div dd-for="this.items" dd-index="i" dd-item="x">
            <b dd-text="'#'+(i+1)+'.'"></b>
            <span dd-if="x.done">&radic;</span>
            <span dd-replace="x.name"></span>
            <button type="button" 
                    dd-if="!x.done" 
                    dd-onclick="complete(x)" 
                    dd-attrs="{disabled:x.impossible}" 
                    dd-text="x.impossible?'Impossible':'Complete'"></button>
        </div>
        <button onclick="addItem()">Add item</button>
    </div>
</main>
<script>
    let context = {
        items: [
            {name: "Make a TODO.", done: true},
            {name: "???", done: false},
            {name: "PROFIT!", done: false, impossible: true}
        ]
    };
    DD.compileAndEval(document.body, context);

    function complete(item) {
        item.done = true;
        DD.evaluate(document.body, context);
    }
</script>

=>

<main>
    <div>
        <b>#1.</b>
        <span>&radic;</span>
        Make a TODO.
    </div>
    <div>
        <b>#2.</b>
        ???
        <button type="button">Complete</button> <!-- with click event listener -->
    </div>
    <div>
        <b>#3.</b>
        PROFIT!
        <button type="button" disabled>Impossible</button>
    </div>
</main>
```

### Options

* `DD.Options.debug(...msg:any)=>void` - print debug messages. Optional.
* `DD.Options.compile(source:string, varnames:string[])=>Function` - compiles expressions into functions.
* `DD.Options.error(error:any, node:Node, source:string)` - error handler.

## Syntax

### `dd-text="jsexpr"`

Replaces this node content with text returned by `jsexpr`.

Example:

```html

<div><span dd-text="Math.PI"></span></div>
=>
<div><span>3.141592653589793</span></div>
```

### `dd-html="jsexpr"`

Replaces this node's inner HTML with `jsexpr`.

Example:

```html

<div dd-html="x"></div>
=> with x="sample <b>text</b>"
<div>sample <b>text</b></div>
```

### `dd-replace="jsexpr"`

Replaces this node with text returned by `jsexpr`.

Example:

```html

<div><span dd-text="Math.PI"></span></div>
=>
<div><!--Math.PI-->3.141592653589793</div>
```

### `dd-attrs="jsexpr"`

Set node attributes from `jsexpr` (should return an object).

* `disabled`, `checked`, and `selected` removed when value is falsy.
* `null` or `undefined` values will remove attribute.
* Attributes not present in returned object will be left unchanged.
* Attributes starting with `on` and function value add an event listener 

Example:

```html
<input type="text" dd-attrs="{disabled:true, value:15, oninput:(event)=>console.log(event)}"/>
=>
<input type="text" disabled value="15"/>
<!-- and addEventListener('input', (event)=>console.log(event)})-->
```

### `dd-onEVENT="jsexpr"`

Add an event listener for `EVENT`, invoking `jsexpr`.

Example:

```html
<input type="text" dd-oninput="event.target.value=event.target.value.toUpperCase()"/>
```

### `dd-for="jsexpr"`, `dd-item="varItem"`, `dd-index="varIndex"`

For every item in array/object returned by `jsexpr`, repeat the node and evaluate with local variables `varIndex` (key or array index) and `varItem` (value or array item).

Example
```html
<div dd-for="this.items" dd-item="x" dd-index="i">
    <span dd-text="i"></span>
    <span dd-if="x.known" dd-text="x.text"></span>
    <span dd-else>???</span>
</div>
=> with this={items:[{known:false,text:'Foo'},{known:true,text:'Bar'}]}
<div>
    <span>0</span>
    <span>???</span>
</div>
<div>
    <span>1</span>
    <span>Bar</span>
</div>
```

## Extending

Short version: 1) extend NodeData; 2) add section to compileNode; 3) add section to evaluateNode.  

TODO explain more.
