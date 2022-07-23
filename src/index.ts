/*
 * Created by aimozg on 24.07.2022.
 */

interface NodeData {
	text?: {
		src: string;
		fn: Function;
	};
	html?: {
		src: string;
		fn: Function;
	};
	replace?: {
		src: string;
		fn: Function;
		present: boolean; /* next text node is the text */
	};
	attrs?: {
		src: string;
		fn: Function;
	};
	on?: Record<string,{fn:Function, src:string}>; /* function returning event listener */
	events?: Record<string,EventListener>;
	if?: {
		src: string;
		fn: Function;
		present: boolean; /* true: this node is the content, false: this node is comment marker */
		content?: Node; /* removed content if not present */
	};
	elseif?: {
		src: string;
		fn: Function;
		present: boolean; /* true: this node is the content, false: this node is comment marker */
		content?: Node; /* removed content if not present */
	};
	else?: {
		present: boolean; /* true: this node is the content, false: this node is comment marker */
		content?: Node; /* removed content if not present */
	};
	for?: {
		fn: Function;
		src: string;
		item?: string;
		index?: string;
		content?: Node;
	};
	foritem?: boolean;
}

interface Node {
	_dd: NodeData;
}

interface DDOptions {
	debug: (...msg: any) => void;
	compile: (source:string, varnames:string[]) => Function;
	error: (error:any, node:Node, source:string) => void
}

namespace DD {
	export let Options: DDOptions = {
		debug: (...msg: any) => console.log("DD", ...msg),
		compile: toFunction,
		error: (error,node,source)=> {
			console.error("Error in expression ",source," of ",node);
			console.error(error?.stack ?? error)
		}
	};
	function debug(...msg:any) {
		Options.debug?.(...msg);
	}

	interface CompileContext {
		vars: string[];
		node: TraverseContinuation;
	}
	function safeCompile(node:Node, source:string, varnames:string[]): Function {
		try {
			return Options.compile(source, varnames);
		} catch (error) {
			Options.error(error, node, source);
			return ()=>undefined as Function;
		}
	}

	function compileNode(node: Element, ctx: CompileContext) {
		let dd: Record<string, string> = {};
		let ddon: Record<string, string> = {};
		let empty = true;
		for (let attr of node.getAttributeNames()) {
			if (attr.indexOf("dd-on") === 0) {
				ddon[attr.substring(5)] = node.getAttribute(attr);
				node.removeAttribute(attr);
				empty = false;
			} else if (attr.indexOf("dd-") === 0) {
				dd[attr.substring(3)] = node.getAttribute(attr);
				node.removeAttribute(attr);
				empty = false;
			}
		}
		if (empty) return;
		let data: NodeData = {};
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
		} else if ('elseif' in dd) {
			data.elseif = {
				src: dd.elseif,
				fn: safeCompile(node, dd.elseif, ctx.vars),
				present: true,
				content: node
			};
		} else if ('else' in dd) {
			data.else = {
				present: true,
				content: node
			}
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
			}
			replace = true;
			if (dd.item) {
				localvars++;
				ctx.vars.push(dd.item)
			}
			if (dd.index) {
				localvars++;
				ctx.vars.push(dd.index)
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
		} else if ('html' in dd) {
			data.html = {
				src: dd.html,
				fn: safeCompile(node, dd.html, ctx.vars)
			};
			removeChildren(node);
		} else if ('replace' in dd) {
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
			data.on ??= {};
			let src = 'function(event){'+ddon[event]+'}';
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
			while (localvars-->0) ctx.vars.pop();
		} else {
			node._dd = data;
		}
	}

	interface EvalContext {
		thisArg?: any;
		vars: any[];
		node: TraverseContinuation;
	}

	function safeEval(node:Node, fn:Function, source:string, ctx:EvalContext):any {
		try {
			return fn.apply(ctx.thisArg, ctx.vars);
		} catch (error) {
			Options.error(error, node, source);
			return undefined;
		}
	}

	function evaluateNode(node: Node, ctx: EvalContext) {
		let data = node._dd;
		if (!data) return;
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
			} else {
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
				if (!nextData) break;
				if (nextData.elseif) {
					let showme:boolean;
					if (value) {
						showme = false; // one of ifs before was true, hide this elseif
					} else {
						value = safeEval(next, nextData.elseif.fn, nextData.elseif.src, ctx);
						debug("eval elseif", value);
						value = !!value;
						showme = value;
					}
					if (showme) {
						if (!nextData.elseif.present) {
							debug("show elseif")
							nextData.elseif.present = true;
							replaceNode(next, nextData.elseif.content);
						}
					} else {
						if (nextData.elseif.present) {
							debug("hide elseif");
							nextData.elseif.present = false;
							// remove self and leave marker
							let marker = document.createComment("dd-elseif");
							marker._dd = nextData;
							replaceNode(next, marker);
						}
					}
				} else if (nextData.else) {
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
					} else {
						// none of ifs was true
						if (!nextData.else.present) {
							debug("show else");
							nextData.else.present = true;
							replaceNode(next, nextData.else.content);
						}
					}
					break;
				} else {
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
		} else if (data.elseif) {
			if (!data.elseif.present) {
				ctx.node = "skip";
				return;
			}
		} else if (data.else) {
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
			debug("eval for",array);
			if (!array) return;
			// remove data.for to safely clone content
			let def = data.for;
			data.for = undefined;
			let next = nextNonEmptySibling(node);
			while (next?._dd?.foritem) {
				// remove previous list - in theory, we could reuse it, but I don't know how to do that
				let nextnext = nextNonEmptySibling(next)
				next.parentNode.removeChild(next);
				next = nextnext;
			}
			let mark = node.nextSibling; // insert before mark
			function iterate(item:any,index:string|number) {
				if (def.item) ctx.vars.push(item);
				if (def.index) ctx.vars.push(index);
				let domItem = cloneNode(def.content);
				node.parentNode.insertBefore(domItem, mark);
				mark = domItem.nextSibling;
				domItem._dd ??= {};
				domItem._dd.foritem = true;
				evaluateInContext(domItem, ctx);
				if (def.index) ctx.vars.pop();
				if (def.item) ctx.vars.pop();
			}
			if (Array.isArray(array)) {
				array.forEach(iterate)
			} else {
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
			debug("eval text",value);
			node.textContent = String(value);
		} else if (data.html) {
			let value = safeEval(node, data.text.fn, data.text.src, ctx);
			debug("eval html",value);
			(node as Element).innerHTML = String(value);
		} else if (data.replace) {
			// this node is really a comment
			let value = safeEval(node, data.replace.fn, data.replace.src, ctx);
			debug("eval replace",value);
			if (data.replace.present) {
				(node.nextSibling as Text).textContent = value;
			} else {
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
				setAttr(node as Element, attr, value);
			}
		}
		///////////
		// dd-on //
		///////////
		if (data.on) {
			for (let event in data.on) {
				debug("eval on",event);
				let listener = safeEval(node, data.on[event].fn, data.on[event].src, ctx);
				if (listener) {
					setAttr(node as Element, 'on'+event, listener);
				}
			}
		}
	}
	function compileInContext(root: Node, ctx: CompileContext) {
		traverse(root, node => node.nodeType === Node.ELEMENT_NODE, (node: Element) => {
			ctx.node = node;
			compileNode(node, ctx);
			return ctx.node;
		})
	}

	function evaluateInContext(root:Node, ctx:EvalContext) {
		traverse(root, node => !!node._dd,
			(node) => {
				ctx.node = node;
				evaluateNode(node, ctx);
				return ctx.node;
			})
	}

	//////////////////////////////////////////////////
	// Public API
	//////////////////////////////////////////////////

	export function compile(root: Node) {
		let ctx: CompileContext = {
			vars: [],
			node: null
		};
		compileInContext(root, ctx);
	}

	export function evaluate(root: Node, thisArg: object = {}) {
		let ctx: EvalContext = {
			vars: [],
			node: null,
			thisArg: thisArg
		};
		evaluateInContext(root, ctx);
	}

	export function compileAndEval(root: Node, thisArg: object = {}) {
		compile(root);
		evaluate(root, thisArg);
	}

	//////////////////////////////////////////////////
	// Utils
	//////////////////////////////////////////////////

	/**
	 * Compile {@param expr} to function taking {@param vars} and returning something
	 */
	function toFunction(expr: string, vars: string[]): Function {
		let fexpr = `(function(${vars.join(',')}){return(${expr})})`;
		debug("compiling function", fexpr);
		return eval(fexpr) as Function;
	}

	/**
	 * Replace {@param oldNode} with {@param newNode}. Return {@param newNode}.
	 */
	export function replaceNode<T extends Node>(oldNode: Node, newNode: T): T {
		let parent = oldNode.parentNode;
		if (!parent) throw new Error("Cannot replace Node with no parent");
		parent.insertBefore(newNode, oldNode);
		parent.removeChild(oldNode);
		return newNode;
	}

	/**
	 * Insert {@param newNode} after {@param reference}. Return {@param newNode}.
	 */
	export function insertAfter<T extends Node>(newNode: T, reference: Node): T {
		reference.parentNode.insertBefore(newNode, reference.nextSibling);
		return newNode;
	}

	export function removeChildren(node?:Node) {
		if (node && node.nodeType === Node.ELEMENT_NODE && node.childNodes) {
			while (node.firstChild) node.removeChild(node.firstChild);
		}
	}

	export function moveChildrenToList(node:Node, target:Node[]) {
		if (node && node.nodeType === Node.ELEMENT_NODE && node.childNodes) {
			while (node.firstChild) {
				target.push(node.firstChild);
				node.removeChild(node.firstChild);
			}
		}
	}

	export function nextNonEmptySibling(node:Node):Node {
		let next = node.nextSibling;
		while (next) {
			if (next.nodeType === Node.ELEMENT_NODE ||
				next._dd ||
				next.nodeType === Node.TEXT_NODE && next.textContent.trim()) return next;
			next = next.nextSibling;
		}
	}

	/** Clone node with _dd metadata */
	export function cloneNode(node:Node):Node {
		let newNode = node.cloneNode(false);
		let dd = node._dd;
		if (dd) {
			let dd2: NodeData = {};
			for (let a in dd) {
				let oldData = (dd as any)[a];
				let newData = Object.assign({}, oldData);
				if ('content' in oldData) {
					let content = oldData.content as Node;
					newData.content = content === node ? node : cloneNode(content);
				}
				(dd2 as any)[a] = newData;
			}
			newNode._dd = dd2;
		}
		for (let child of node.childNodes) {
			newNode.appendChild(cloneNode(child));
		}
		return newNode;
	}

	export function setAttr(node:Element, attr:string, value:any) {
		// special case - certain flag attributes
		if (attr === "disabled" || attr === "checked" || attr === "selected") {
			if (!!value) {
				node.setAttribute(attr, "");
			} else {
				node.removeAttribute(attr);
			}
			return;
		}
		// special case - events
		if (attr.indexOf('on') === 0 && typeof value !== 'string') {
			let eventName = attr.slice(2);
			let existingListener = node._dd?.events?.[eventName];
			if (existingListener === value) return;
			// remove listener
			if (existingListener) {
				node.removeEventListener(eventName, existingListener);
			}
			if (typeof value === 'function') {
				// add/replace listener
				node.addEventListener(eventName, value);
				node._dd ??= {};
				node._dd.events ??= {};
				node._dd.events[eventName] = value;
			}
			return;
		}
		// ordinary case
		if (value === null || value === undefined) {
			node.removeAttribute(attr);
		} else {
			node.setAttribute(attr, value);
		}
	}

	export type TraverseContinuation = Node | "skip" | "halt" | void;

	/**
	 * Traverse DOM from {@param root}, breadth-first. Invoke {@param callback} on nodes passing {@param filter}.
	 *
	 * Will iterate all types of nodes, including comments and text nodes.
	 * The callback is allowed to modify node; however, in that case it should return the replacement,
	 * or "skip" if node was removed,
	 * or "halt" if traversal must stop
	 */
	export function traverse(root: Node, filter: ((node: Node) => boolean) | undefined | null, callback: (node: Node) => TraverseContinuation) {
		let queue:{parent:Node,node:Node}[] = [{parent:root.parentNode,node:root}];
		while (queue.length > 0) {
			let {parent,node} = queue.shift();
			if (node.parentNode !== parent) continue; // skip nodes added in previous iterations that were removed
			if (!filter || filter(node)) {
				let ret = callback(node);
				if (ret === "skip") continue;
				if (ret === "halt") break;
				if (ret) node = ret;
			}
			if (node.nodeType === Node.ELEMENT_NODE) {
				for (let child of node.childNodes) {
					queue.push({parent:node,node:child});
				}
			}
		}
	}

	export function traverseUp(start: Node, until: Node | undefined | null, callback: (node: Node) => any) {
		while (start && start !== until) {
			callback(start);
			start = start.parentNode;
		}
	}
}
