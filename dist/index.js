/*
 * Created by aimozg on 24.07.2022.
 */
var DD;
(function (DD) {
    DD.Options = {
        debug: (...msg) => console.log("DD", ...msg),
        compile: toFunction,
        error: (error, node, source) => {
            var _a;
            console.error("Error in expression ", source, " of ", node);
            console.error((_a = error === null || error === void 0 ? void 0 : error.stack) !== null && _a !== void 0 ? _a : error);
        }
    };
    function debug(...msg) {
        var _a;
        (_a = DD.Options.debug) === null || _a === void 0 ? void 0 : _a.call(DD.Options, ...msg);
    }
    function safeCompile(node, source, varnames) {
        try {
            return DD.Options.compile(source, varnames);
        }
        catch (error) {
            DD.Options.error(error, node, source);
            return () => undefined;
        }
    }
    function compileNode(node, ctx) {
        var _a;
        let dd = {};
        let ddon = {};
        let empty = true;
        for (let attr of node.getAttributeNames()) {
            if (attr.indexOf("dd-on") === 0) {
                ddon[attr.substring(5)] = node.getAttribute(attr);
                node.removeAttribute(attr);
                empty = false;
            }
            else if (attr.indexOf("dd-") === 0) {
                dd[attr.substring(3)] = node.getAttribute(attr);
                node.removeAttribute(attr);
                empty = false;
            }
        }
        if (empty)
            return;
        let data = {};
        let replace = false; // replace with comment
        let localvars = 0; // no. of local vars added to ctx.vars
        ///////////
        // dd-if //
        ///////////
        if ('if' in dd) {
            data.if = {
                src: dd.if,
                fn: safeCompile(node, dd.if, ctx.vars),
                present: true,
                content: node
            };
        }
        else if ('elseif' in dd) {
            data.elseif = {
                src: dd.elseif,
                fn: safeCompile(node, dd.elseif, ctx.vars),
                present: true,
                content: node
            };
        }
        else if ('else' in dd) {
            data.else = {
                present: true,
                content: node
            };
        }
        ////////////
        // dd-for //
        ////////////
        if ('for' in dd) {
            data.for = {
                src: dd.for,
                fn: safeCompile(node, dd.for, ctx.vars),
                item: dd.item,
                index: dd.index,
                content: node
            };
            replace = true;
            if (dd.item) {
                localvars++;
                ctx.vars.push(dd.item);
            }
            if (dd.index) {
                localvars++;
                ctx.vars.push(dd.index);
            }
            // compile children manually because replace=true
            for (let child of node.childNodes) {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    compileInContext(child, ctx);
                }
            }
        }
        //////////////////////////////////
        // dd-text, dd-html, dd-replace //
        //////////////////////////////////
        if ('text' in dd) {
            data.text = {
                src: dd.text,
                fn: safeCompile(node, dd.text, ctx.vars)
            };
            removeChildren(node);
        }
        else if ('html' in dd) {
            data.html = {
                src: dd.html,
                fn: safeCompile(node, dd.html, ctx.vars)
            };
            removeChildren(node);
        }
        else if ('replace' in dd) {
            data.replace = {
                src: dd.replace,
                fn: safeCompile(node, dd.replace, ctx.vars),
                present: false
            };
            replace = true;
        }
        //////////////
        // dd-attrs //
        //////////////
        if ('attrs' in dd) {
            data.attrs = {
                src: dd.attrs,
                fn: safeCompile(node, dd.attrs, ctx.vars)
            };
        }
        ///////////
        // dd-on //
        ///////////
        for (let event in ddon) {
            (_a = data.on) !== null && _a !== void 0 ? _a : (data.on = {});
            let src = 'function(event){' + ddon[event] + '}';
            data.on[event] = {
                fn: safeCompile(node, src, ctx.vars),
                src: src
            };
        }
        ///////////////////////////////////
        debug("compiled to", data);
        if (replace) {
            let comment = replaceNode(node, document.createComment(""));
            comment._dd = data;
            ctx.node = comment;
            while (localvars-- > 0)
                ctx.vars.pop();
        }
        else {
            node._dd = data;
        }
    }
    function safeEval(node, fn, source, ctx) {
        try {
            return fn.apply(ctx.thisArg, ctx.vars);
        }
        catch (error) {
            DD.Options.error(error, node, source);
            return undefined;
        }
    }
    function evaluateNode(node, ctx) {
        var _a;
        let data = node._dd;
        if (!data)
            return;
        debug("eval node", node, data, ...ctx.vars);
        //////////
        // dd-if
        //////////
        if (data.if) {
            let next = nextNonEmptySibling(node); // will be used in elseif chain traversal
            let value = safeEval(node, data.if.fn, data.if.src, ctx);
            debug("eval if", value);
            value = !!value;
            if (value) {
                if (!data.if.present) {
                    debug("show if");
                    data.if.present = true;
                    replaceNode(node, data.if.content);
                    ctx.node = data.if.content;
                }
            }
            else {
                if (data.if.present) {
                    debug("hide if");
                    data.if.present = false;
                    // remove self and leave marker
                    let marker = document.createComment("dd-if");
                    marker._dd = data;
                    replaceNode(node, marker);
                }
            }
            // iterate over elseif's and else
            while (next) {
                // might replace next, so save next next beforehand
                let nextNext = nextNonEmptySibling(next);
                let nextData = next._dd;
                if (!nextData)
                    break;
                if (nextData.elseif) {
                    let showme;
                    if (value) {
                        showme = false; // one of ifs before was true, hide this elseif
                    }
                    else {
                        value = safeEval(next, nextData.elseif.fn, nextData.elseif.src, ctx);
                        debug("eval elseif", value);
                        value = !!value;
                        showme = value;
                    }
                    if (showme) {
                        if (!nextData.elseif.present) {
                            debug("show elseif");
                            nextData.elseif.present = true;
                            replaceNode(next, nextData.elseif.content);
                        }
                    }
                    else {
                        if (nextData.elseif.present) {
                            debug("hide elseif");
                            nextData.elseif.present = false;
                            // remove self and leave marker
                            let marker = document.createComment("dd-elseif");
                            marker._dd = nextData;
                            replaceNode(next, marker);
                        }
                    }
                }
                else if (nextData.else) {
                    if (value) {
                        // one of ifs was true, hide else
                        if (nextData.else.present) {
                            debug("hide else");
                            nextData.else.present = false;
                            // remove self and leave marker
                            let marker = document.createComment("dd-else");
                            marker._dd = nextData;
                            replaceNode(next, marker);
                        }
                    }
                    else {
                        // none of ifs was true
                        if (!nextData.else.present) {
                            debug("show else");
                            nextData.else.present = true;
                            replaceNode(next, nextData.else.content);
                        }
                    }
                    break;
                }
                else {
                    // anything without dd-elseif or dd-else
                    break;
                }
                next = nextNext;
            }
            // skip evaluation of conditional blocks that evaluated to false
            if (!data.if.present) {
                ctx.node = "skip";
                return;
            }
        }
        else if (data.elseif) {
            if (!data.elseif.present) {
                ctx.node = "skip";
                return;
            }
        }
        else if (data.else) {
            if (!data.else.present) {
                ctx.node = "skip";
                return;
            }
        }
        ////////////
        // dd-for //
        ////////////
        if (data.for) {
            let array = safeEval(node, data.for.fn, data.for.src, ctx);
            debug("eval for", array);
            if (!array)
                return;
            // remove data.for to safely clone content
            let def = data.for;
            data.for = undefined;
            let next = nextNonEmptySibling(node);
            while ((_a = next === null || next === void 0 ? void 0 : next._dd) === null || _a === void 0 ? void 0 : _a.foritem) {
                // remove previous list - in theory, we could reuse it, but I don't know how to do that
                let nextnext = nextNonEmptySibling(next);
                next.parentNode.removeChild(next);
                next = nextnext;
            }
            let mark = node.nextSibling; // insert before mark
            function iterate(item, index) {
                var _a;
                if (def.item)
                    ctx.vars.push(item);
                if (def.index)
                    ctx.vars.push(index);
                let domItem = cloneNode(def.content);
                node.parentNode.insertBefore(domItem, mark);
                mark = domItem.nextSibling;
                (_a = domItem._dd) !== null && _a !== void 0 ? _a : (domItem._dd = {});
                domItem._dd.foritem = true;
                evaluateInContext(domItem, ctx);
                if (def.index)
                    ctx.vars.pop();
                if (def.item)
                    ctx.vars.pop();
            }
            if (Array.isArray(array)) {
                array.forEach(iterate);
            }
            else {
                for (let index in array) {
                    iterate(array[index], index);
                }
            }
            debug("end eval for");
            data.for = def;
        }
        //////////////////////////////////
        // dd-text, dd-html, dd-replace //
        //////////////////////////////////
        if (data.text) {
            let value = safeEval(node, data.text.fn, data.text.src, ctx);
            debug("eval text", value);
            node.textContent = String(value);
        }
        else if (data.html) {
            let value = safeEval(node, data.text.fn, data.text.src, ctx);
            debug("eval html", value);
            node.innerHTML = String(value);
        }
        else if (data.replace) {
            // this node is really a comment
            let value = safeEval(node, data.replace.fn, data.replace.src, ctx);
            debug("eval replace", value);
            if (data.replace.present) {
                node.nextSibling.textContent = value;
            }
            else {
                data.replace.present = true;
                insertAfter(document.createTextNode(value), node);
            }
        }
        //////////////
        // dd-attrs //
        //////////////
        if (data.attrs) {
            let attrs = safeEval(node, data.attrs.fn, data.attrs.src, ctx);
            debug("eval attrs", attrs);
            for (let attr in attrs) {
                let value = attrs[attr];
                setAttr(node, attr, value);
            }
        }
        ///////////
        // dd-on //
        ///////////
        if (data.on) {
            for (let event in data.on) {
                debug("eval on", event);
                let listener = safeEval(node, data.on[event].fn, data.on[event].src, ctx);
                if (listener) {
                    setAttr(node, 'on' + event, listener);
                }
            }
        }
    }
    function compileInContext(root, ctx) {
        traverse(root, node => node.nodeType === Node.ELEMENT_NODE, (node) => {
            ctx.node = node;
            compileNode(node, ctx);
            return ctx.node;
        });
    }
    function evaluateInContext(root, ctx) {
        traverse(root, node => !!node._dd, (node) => {
            ctx.node = node;
            evaluateNode(node, ctx);
            return ctx.node;
        });
    }
    //////////////////////////////////////////////////
    // Public API
    //////////////////////////////////////////////////
    function compile(root) {
        let ctx = {
            vars: [],
            node: null
        };
        compileInContext(root, ctx);
    }
    DD.compile = compile;
    function evaluate(root, thisArg = {}) {
        let ctx = {
            vars: [],
            node: null,
            thisArg: thisArg
        };
        evaluateInContext(root, ctx);
    }
    DD.evaluate = evaluate;
    function compileAndEval(root, thisArg = {}) {
        compile(root);
        evaluate(root, thisArg);
    }
    DD.compileAndEval = compileAndEval;
    //////////////////////////////////////////////////
    // Utils
    //////////////////////////////////////////////////
    /**
     * Compile {@param expr} to function taking {@param vars} and returning something
     */
    function toFunction(expr, vars) {
        let fexpr = `(function(${vars.join(',')}){return(${expr})})`;
        debug("compiling function", fexpr);
        return eval(fexpr);
    }
    /**
     * Replace {@param oldNode} with {@param newNode}. Return {@param newNode}.
     */
    function replaceNode(oldNode, newNode) {
        let parent = oldNode.parentNode;
        if (!parent)
            throw new Error("Cannot replace Node with no parent");
        parent.insertBefore(newNode, oldNode);
        parent.removeChild(oldNode);
        return newNode;
    }
    DD.replaceNode = replaceNode;
    /**
     * Insert {@param newNode} after {@param reference}. Return {@param newNode}.
     */
    function insertAfter(newNode, reference) {
        reference.parentNode.insertBefore(newNode, reference.nextSibling);
        return newNode;
    }
    DD.insertAfter = insertAfter;
    function removeChildren(node) {
        if (node && node.nodeType === Node.ELEMENT_NODE && node.childNodes) {
            while (node.firstChild)
                node.removeChild(node.firstChild);
        }
    }
    DD.removeChildren = removeChildren;
    function moveChildrenToList(node, target) {
        if (node && node.nodeType === Node.ELEMENT_NODE && node.childNodes) {
            while (node.firstChild) {
                target.push(node.firstChild);
                node.removeChild(node.firstChild);
            }
        }
    }
    DD.moveChildrenToList = moveChildrenToList;
    function nextNonEmptySibling(node) {
        let next = node.nextSibling;
        while (next) {
            if (next.nodeType === Node.ELEMENT_NODE ||
                next._dd ||
                next.nodeType === Node.TEXT_NODE && next.textContent.trim())
                return next;
            next = next.nextSibling;
        }
    }
    DD.nextNonEmptySibling = nextNonEmptySibling;
    /** Clone node with _dd metadata */
    function cloneNode(node) {
        let newNode = node.cloneNode(false);
        let dd = node._dd;
        if (dd) {
            let dd2 = {};
            for (let a in dd) {
                let oldData = dd[a];
                let newData = Object.assign({}, oldData);
                if ('content' in oldData) {
                    let content = oldData.content;
                    newData.content = content === node ? node : cloneNode(content);
                }
                dd2[a] = newData;
            }
            newNode._dd = dd2;
        }
        for (let child of node.childNodes) {
            newNode.appendChild(cloneNode(child));
        }
        return newNode;
    }
    DD.cloneNode = cloneNode;
    function setAttr(node, attr, value) {
        var _a, _b, _c, _d;
        var _e;
        // special case - certain flag attributes
        if (attr === "disabled" || attr === "checked" || attr === "selected") {
            if (!!value) {
                node.setAttribute(attr, "");
            }
            else {
                node.removeAttribute(attr);
            }
            return;
        }
        // special case - events
        if (attr.indexOf('on') === 0 && typeof value !== 'string') {
            let eventName = attr.slice(2);
            let existingListener = (_b = (_a = node._dd) === null || _a === void 0 ? void 0 : _a.events) === null || _b === void 0 ? void 0 : _b[eventName];
            if (existingListener === value)
                return;
            // remove listener
            if (existingListener) {
                node.removeEventListener(eventName, existingListener);
            }
            if (typeof value === 'function') {
                // add/replace listener
                node.addEventListener(eventName, value);
                (_c = node._dd) !== null && _c !== void 0 ? _c : (node._dd = {});
                (_d = (_e = node._dd).events) !== null && _d !== void 0 ? _d : (_e.events = {});
                node._dd.events[eventName] = value;
            }
            return;
        }
        // ordinary case
        if (value === null || value === undefined) {
            node.removeAttribute(attr);
        }
        else {
            node.setAttribute(attr, value);
        }
    }
    DD.setAttr = setAttr;
    /**
     * Traverse DOM from {@param root}, breadth-first. Invoke {@param callback} on nodes passing {@param filter}.
     *
     * Will iterate all types of nodes, including comments and text nodes.
     * The callback is allowed to modify node; however, in that case it should return the replacement,
     * or "skip" if node was removed,
     * or "halt" if traversal must stop
     */
    function traverse(root, filter, callback) {
        let queue = [{ parent: root.parentNode, node: root }];
        while (queue.length > 0) {
            let { parent, node } = queue.shift();
            if (node.parentNode !== parent)
                continue; // skip nodes added in previous iterations that were removed
            if (!filter || filter(node)) {
                let ret = callback(node);
                if (ret === "skip")
                    continue;
                if (ret === "halt")
                    break;
                if (ret)
                    node = ret;
            }
            if (node.nodeType === Node.ELEMENT_NODE) {
                for (let child of node.childNodes) {
                    queue.push({ parent: node, node: child });
                }
            }
        }
    }
    DD.traverse = traverse;
    function traverseUp(start, until, callback) {
        while (start && start !== until) {
            callback(start);
            start = start.parentNode;
        }
    }
    DD.traverseUp = traverseUp;
})(DD || (DD = {}));
