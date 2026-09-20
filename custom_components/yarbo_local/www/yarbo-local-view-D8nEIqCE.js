import { n as e, r as t, t as n } from "./yarbo-local-view-BOqjInrS.js";
//#region node_modules/@lit/reactive-element/css-tag.js
var r = globalThis, i = r.ShadowRoot && (r.ShadyCSS === void 0 || r.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype, a = Symbol(), o = /* @__PURE__ */ new WeakMap(), s = class {
	constructor(e, t, n) {
		if (this._$cssResult$ = !0, n !== a) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
		this.cssText = e, this.t = t;
	}
	get styleSheet() {
		let e = this.o, t = this.t;
		if (i && e === void 0) {
			let n = t !== void 0 && t.length === 1;
			n && (e = o.get(t)), e === void 0 && ((this.o = e = new CSSStyleSheet()).replaceSync(this.cssText), n && o.set(t, e));
		}
		return e;
	}
	toString() {
		return this.cssText;
	}
}, c = (e) => new s(typeof e == "string" ? e : e + "", void 0, a), l = (e, ...t) => new s(e.length === 1 ? e[0] : t.reduce((t, n, r) => t + ((e) => {
	if (!0 === e._$cssResult$) return e.cssText;
	if (typeof e == "number") return e;
	throw Error("Value passed to 'css' function must be a 'css' function result: " + e + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
})(n) + e[r + 1], e[0]), e, a), u = (e, t) => {
	if (i) e.adoptedStyleSheets = t.map((e) => e instanceof CSSStyleSheet ? e : e.styleSheet);
	else for (let n of t) {
		let t = document.createElement("style"), i = r.litNonce;
		i !== void 0 && t.setAttribute("nonce", i), t.textContent = n.cssText, e.appendChild(t);
	}
}, d = i ? (e) => e : (e) => e instanceof CSSStyleSheet ? ((e) => {
	let t = "";
	for (let n of e.cssRules) t += n.cssText;
	return c(t);
})(e) : e, { is: ee, defineProperty: te, getOwnPropertyDescriptor: ne, getOwnPropertyNames: re, getOwnPropertySymbols: ie, getPrototypeOf: ae } = Object, f = globalThis, oe = f.trustedTypes, se = oe ? oe.emptyScript : "", ce = f.reactiveElementPolyfillSupport, p = (e, t) => e, m = {
	toAttribute(e, t) {
		switch (t) {
			case Boolean:
				e = e ? se : null;
				break;
			case Object:
			case Array: e = e == null ? e : JSON.stringify(e);
		}
		return e;
	},
	fromAttribute(e, t) {
		let n = e;
		switch (t) {
			case Boolean:
				n = e !== null;
				break;
			case Number:
				n = e === null ? null : Number(e);
				break;
			case Object:
			case Array: try {
				n = JSON.parse(e);
			} catch {
				n = null;
			}
		}
		return n;
	}
}, le = (e, t) => !ee(e, t), ue = {
	attribute: !0,
	type: String,
	converter: m,
	reflect: !1,
	useDefault: !1,
	hasChanged: le
};
Symbol.metadata ??= Symbol("metadata"), f.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
var h = class extends HTMLElement {
	static addInitializer(e) {
		this._$Ei(), (this.l ??= []).push(e);
	}
	static get observedAttributes() {
		return this.finalize(), this._$Eh && [...this._$Eh.keys()];
	}
	static createProperty(e, t = ue) {
		if (t.state && (t.attribute = !1), this._$Ei(), this.prototype.hasOwnProperty(e) && ((t = Object.create(t)).wrapped = !0), this.elementProperties.set(e, t), !t.noAccessor) {
			let n = Symbol(), r = this.getPropertyDescriptor(e, n, t);
			r !== void 0 && te(this.prototype, e, r);
		}
	}
	static getPropertyDescriptor(e, t, n) {
		let { get: r, set: i } = ne(this.prototype, e) ?? {
			get() {
				return this[t];
			},
			set(e) {
				this[t] = e;
			}
		};
		return {
			get: r,
			set(t) {
				let a = r?.call(this);
				i?.call(this, t), this.requestUpdate(e, a, n);
			},
			configurable: !0,
			enumerable: !0
		};
	}
	static getPropertyOptions(e) {
		return this.elementProperties.get(e) ?? ue;
	}
	static _$Ei() {
		if (this.hasOwnProperty(p("elementProperties"))) return;
		let e = ae(this);
		e.finalize(), e.l !== void 0 && (this.l = [...e.l]), this.elementProperties = new Map(e.elementProperties);
	}
	static finalize() {
		if (this.hasOwnProperty(p("finalized"))) return;
		if (this.finalized = !0, this._$Ei(), this.hasOwnProperty(p("properties"))) {
			let e = this.properties, t = [...re(e), ...ie(e)];
			for (let n of t) this.createProperty(n, e[n]);
		}
		let e = this[Symbol.metadata];
		if (e !== null) {
			let t = litPropertyMetadata.get(e);
			if (t !== void 0) for (let [e, n] of t) this.elementProperties.set(e, n);
		}
		this._$Eh = /* @__PURE__ */ new Map();
		for (let [e, t] of this.elementProperties) {
			let n = this._$Eu(e, t);
			n !== void 0 && this._$Eh.set(n, e);
		}
		this.elementStyles = this.finalizeStyles(this.styles);
	}
	static finalizeStyles(e) {
		let t = [];
		if (Array.isArray(e)) {
			let n = new Set(e.flat(1 / 0).reverse());
			for (let e of n) t.unshift(d(e));
		} else e !== void 0 && t.push(d(e));
		return t;
	}
	static _$Eu(e, t) {
		let n = t.attribute;
		return !1 === n ? void 0 : typeof n == "string" ? n : typeof e == "string" ? e.toLowerCase() : void 0;
	}
	constructor() {
		super(), this._$Ep = void 0, this.isUpdatePending = !1, this.hasUpdated = !1, this._$Em = null, this._$Ev();
	}
	_$Ev() {
		this._$ES = new Promise((e) => this.enableUpdating = e), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((e) => e(this));
	}
	addController(e) {
		(this._$EO ??= /* @__PURE__ */ new Set()).add(e), this.renderRoot !== void 0 && this.isConnected && e.hostConnected?.();
	}
	removeController(e) {
		this._$EO?.delete(e);
	}
	_$E_() {
		let e = /* @__PURE__ */ new Map(), t = this.constructor.elementProperties;
		for (let n of t.keys()) this.hasOwnProperty(n) && (e.set(n, this[n]), delete this[n]);
		e.size > 0 && (this._$Ep = e);
	}
	createRenderRoot() {
		let e = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
		return u(e, this.constructor.elementStyles), e;
	}
	connectedCallback() {
		this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(!0), this._$EO?.forEach((e) => e.hostConnected?.());
	}
	enableUpdating(e) {}
	disconnectedCallback() {
		this._$EO?.forEach((e) => e.hostDisconnected?.());
	}
	attributeChangedCallback(e, t, n) {
		this._$AK(e, n);
	}
	_$ET(e, t) {
		let n = this.constructor.elementProperties.get(e), r = this.constructor._$Eu(e, n);
		if (r !== void 0 && !0 === n.reflect) {
			let i = (n.converter?.toAttribute === void 0 ? m : n.converter).toAttribute(t, n.type);
			this._$Em = e, i == null ? this.removeAttribute(r) : this.setAttribute(r, i), this._$Em = null;
		}
	}
	_$AK(e, t) {
		let n = this.constructor, r = n._$Eh.get(e);
		if (r !== void 0 && this._$Em !== r) {
			let e = n.getPropertyOptions(r), i = typeof e.converter == "function" ? { fromAttribute: e.converter } : e.converter?.fromAttribute === void 0 ? m : e.converter;
			this._$Em = r;
			let a = i.fromAttribute(t, e.type);
			this[r] = a ?? this._$Ej?.get(r) ?? a, this._$Em = null;
		}
	}
	requestUpdate(e, t, n, r = !1, i) {
		if (e !== void 0) {
			let a = this.constructor;
			if (!1 === r && (i = this[e]), n ??= a.getPropertyOptions(e), !((n.hasChanged ?? le)(i, t) || n.useDefault && n.reflect && i === this._$Ej?.get(e) && !this.hasAttribute(a._$Eu(e, n)))) return;
			this.C(e, t, n);
		}
		!1 === this.isUpdatePending && (this._$ES = this._$EP());
	}
	C(e, t, { useDefault: n, reflect: r, wrapped: i }, a) {
		n && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(e) && (this._$Ej.set(e, a ?? t ?? this[e]), !0 !== i || a !== void 0) || (this._$AL.has(e) || (this.hasUpdated || n || (t = void 0), this._$AL.set(e, t)), !0 === r && this._$Em !== e && (this._$Eq ??= /* @__PURE__ */ new Set()).add(e));
	}
	async _$EP() {
		this.isUpdatePending = !0;
		try {
			await this._$ES;
		} catch (e) {
			Promise.reject(e);
		}
		let e = this.scheduleUpdate();
		return e != null && await e, !this.isUpdatePending;
	}
	scheduleUpdate() {
		return this.performUpdate();
	}
	performUpdate() {
		if (!this.isUpdatePending) return;
		if (!this.hasUpdated) {
			if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
				for (let [e, t] of this._$Ep) this[e] = t;
				this._$Ep = void 0;
			}
			let e = this.constructor.elementProperties;
			if (e.size > 0) for (let [t, n] of e) {
				let { wrapped: e } = n, r = this[t];
				!0 !== e || this._$AL.has(t) || r === void 0 || this.C(t, void 0, n, r);
			}
		}
		let e = !1, t = this._$AL;
		try {
			e = this.shouldUpdate(t), e ? (this.willUpdate(t), this._$EO?.forEach((e) => e.hostUpdate?.()), this.update(t)) : this._$EM();
		} catch (t) {
			throw e = !1, this._$EM(), t;
		}
		e && this._$AE(t);
	}
	willUpdate(e) {}
	_$AE(e) {
		this._$EO?.forEach((e) => e.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = !0, this.firstUpdated(e)), this.updated(e);
	}
	_$EM() {
		this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = !1;
	}
	get updateComplete() {
		return this.getUpdateComplete();
	}
	getUpdateComplete() {
		return this._$ES;
	}
	shouldUpdate(e) {
		return !0;
	}
	update(e) {
		this._$Eq &&= this._$Eq.forEach((e) => this._$ET(e, this[e])), this._$EM();
	}
	updated(e) {}
	firstUpdated(e) {}
};
h.elementStyles = [], h.shadowRootOptions = { mode: "open" }, h[p("elementProperties")] = /* @__PURE__ */ new Map(), h[p("finalized")] = /* @__PURE__ */ new Map(), ce?.({ ReactiveElement: h }), (f.reactiveElementVersions ??= []).push("2.1.2");
//#endregion
//#region node_modules/lit-html/lit-html.js
var g = globalThis, _ = (e) => e, v = g.trustedTypes, y = v ? v.createPolicy("lit-html", { createHTML: (e) => e }) : void 0, b = "$lit$", x = `lit$${Math.random().toFixed(9).slice(2)}$`, S = "?" + x, de = `<${S}>`, C = document, w = () => C.createComment(""), T = (e) => e === null || typeof e != "object" && typeof e != "function", E = Array.isArray, fe = (e) => E(e) || typeof e?.[Symbol.iterator] == "function", D = "[ 	\n\f\r]", O = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g, pe = /-->/g, me = />/g, k = RegExp(`>|${D}(?:([^\\s"'>=/]+)(${D}*=${D}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`, "g"), he = /'/g, ge = /"/g, A = /^(?:script|style|textarea|title)$/i, j = (e) => (t, ...n) => ({
	_$litType$: e,
	strings: t,
	values: n
}), M = j(1), N = j(2), P = Symbol.for("lit-noChange"), F = Symbol.for("lit-nothing"), I = /* @__PURE__ */ new WeakMap(), L = C.createTreeWalker(C, 129);
function R(e, t) {
	if (!E(e) || !e.hasOwnProperty("raw")) throw Error("invalid template strings array");
	return y === void 0 ? t : y.createHTML(t);
}
var _e = (e, t) => {
	let n = e.length - 1, r = [], i, a = t === 2 ? "<svg>" : t === 3 ? "<math>" : "", o = O;
	for (let t = 0; t < n; t++) {
		let n = e[t], s, c, l = -1, u = 0;
		for (; u < n.length && (o.lastIndex = u, c = o.exec(n), c !== null);) u = o.lastIndex, o === O ? c[1] === "!--" ? o = pe : c[1] === void 0 ? c[2] === void 0 ? c[3] !== void 0 && (o = k) : (A.test(c[2]) && (i = RegExp("</" + c[2], "g")), o = k) : o = me : o === k ? c[0] === ">" ? (o = i ?? O, l = -1) : c[1] === void 0 ? l = -2 : (l = o.lastIndex - c[2].length, s = c[1], o = c[3] === void 0 ? k : c[3] === "\"" ? ge : he) : o === ge || o === he ? o = k : o === pe || o === me ? o = O : (o = k, i = void 0);
		let d = o === k && e[t + 1].startsWith("/>") ? " " : "";
		a += o === O ? n + de : l >= 0 ? (r.push(s), n.slice(0, l) + b + n.slice(l) + x + d) : n + x + (l === -2 ? t : d);
	}
	return [R(e, a + (e[n] || "<?>") + (t === 2 ? "</svg>" : t === 3 ? "</math>" : "")), r];
}, z = class e {
	constructor({ strings: t, _$litType$: n }, r) {
		let i;
		this.parts = [];
		let a = 0, o = 0, s = t.length - 1, c = this.parts, [l, u] = _e(t, n);
		if (this.el = e.createElement(l, r), L.currentNode = this.el.content, n === 2 || n === 3) {
			let e = this.el.content.firstChild;
			e.replaceWith(...e.childNodes);
		}
		for (; (i = L.nextNode()) !== null && c.length < s;) {
			if (i.nodeType === 1) {
				if (i.hasAttributes()) for (let e of i.getAttributeNames()) if (e.endsWith(b)) {
					let t = u[o++], n = i.getAttribute(e).split(x), r = /([.?@])?(.*)/.exec(t);
					c.push({
						type: 1,
						index: a,
						name: r[2],
						strings: n,
						ctor: r[1] === "." ? ye : r[1] === "?" ? be : r[1] === "@" ? xe : H
					}), i.removeAttribute(e);
				} else e.startsWith(x) && (c.push({
					type: 6,
					index: a
				}), i.removeAttribute(e));
				if (A.test(i.tagName)) {
					let e = i.textContent.split(x), t = e.length - 1;
					if (t > 0) {
						i.textContent = v ? v.emptyScript : "";
						for (let n = 0; n < t; n++) i.append(e[n], w()), L.nextNode(), c.push({
							type: 2,
							index: ++a
						});
						i.append(e[t], w());
					}
				}
			} else if (i.nodeType === 8) {
				if (i.data === S) c.push({
					type: 2,
					index: a
				});
				else {
					let e = -1;
					for (; (e = i.data.indexOf(x, e + 1)) !== -1;) c.push({
						type: 7,
						index: a
					}), e += x.length - 1;
				}
			}
			a++;
		}
	}
	static createElement(e, t) {
		let n = C.createElement("template");
		return n.innerHTML = e, n;
	}
};
function B(e, t, n = e, r) {
	if (t === P) return t;
	let i = r === void 0 ? n._$Cl : n._$Co?.[r], a = T(t) ? void 0 : t._$litDirective$;
	return i?.constructor !== a && (i?._$AO?.(!1), a === void 0 ? i = void 0 : (i = new a(e), i._$AT(e, n, r)), r === void 0 ? n._$Cl = i : (n._$Co ??= [])[r] = i), i !== void 0 && (t = B(e, i._$AS(e, t.values), i, r)), t;
}
var ve = class {
	constructor(e, t) {
		this._$AV = [], this._$AN = void 0, this._$AD = e, this._$AM = t;
	}
	get parentNode() {
		return this._$AM.parentNode;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	u(e) {
		let { el: { content: t }, parts: n } = this._$AD, r = (e?.creationScope ?? C).importNode(t, !0);
		L.currentNode = r;
		let i = L.nextNode(), a = 0, o = 0, s = n[0];
		for (; s !== void 0;) {
			if (a === s.index) {
				let t;
				s.type === 2 ? t = new V(i, i.nextSibling, this, e) : s.type === 1 ? t = new s.ctor(i, s.name, s.strings, this, e) : s.type === 6 && (t = new Se(i, this, e)), this._$AV.push(t), s = n[++o];
			}
			a !== s?.index && (i = L.nextNode(), a++);
		}
		return L.currentNode = C, r;
	}
	p(e) {
		let t = 0;
		for (let n of this._$AV) n !== void 0 && (n.strings === void 0 ? n._$AI(e[t]) : (n._$AI(e, n, t), t += n.strings.length - 2)), t++;
	}
}, V = class e {
	get _$AU() {
		return this._$AM?._$AU ?? this._$Cv;
	}
	constructor(e, t, n, r) {
		this.type = 2, this._$AH = F, this._$AN = void 0, this._$AA = e, this._$AB = t, this._$AM = n, this.options = r, this._$Cv = r?.isConnected ?? !0;
	}
	get parentNode() {
		let e = this._$AA.parentNode, t = this._$AM;
		return t !== void 0 && e?.nodeType === 11 && (e = t.parentNode), e;
	}
	get startNode() {
		return this._$AA;
	}
	get endNode() {
		return this._$AB;
	}
	_$AI(e, t = this) {
		e = B(this, e, t), T(e) ? e === F || e == null || e === "" ? (this._$AH !== F && this._$AR(), this._$AH = F) : e !== this._$AH && e !== P && this._(e) : e._$litType$ === void 0 ? e.nodeType === void 0 ? fe(e) ? this.k(e) : this._(e) : this.T(e) : this.$(e);
	}
	O(e) {
		return this._$AA.parentNode.insertBefore(e, this._$AB);
	}
	T(e) {
		this._$AH !== e && (this._$AR(), this._$AH = this.O(e));
	}
	_(e) {
		this._$AH !== F && T(this._$AH) ? this._$AA.nextSibling.data = e : this.T(C.createTextNode(e)), this._$AH = e;
	}
	$(e) {
		let { values: t, _$litType$: n } = e, r = typeof n == "number" ? this._$AC(e) : (n.el === void 0 && (n.el = z.createElement(R(n.h, n.h[0]), this.options)), n);
		if (this._$AH?._$AD === r) this._$AH.p(t);
		else {
			let e = new ve(r, this), n = e.u(this.options);
			e.p(t), this.T(n), this._$AH = e;
		}
	}
	_$AC(e) {
		let t = I.get(e.strings);
		return t === void 0 && I.set(e.strings, t = new z(e)), t;
	}
	k(t) {
		E(this._$AH) || (this._$AH = [], this._$AR());
		let n = this._$AH, r, i = 0;
		for (let a of t) i === n.length ? n.push(r = new e(this.O(w()), this.O(w()), this, this.options)) : r = n[i], r._$AI(a), i++;
		i < n.length && (this._$AR(r && r._$AB.nextSibling, i), n.length = i);
	}
	_$AR(e = this._$AA.nextSibling, t) {
		for (this._$AP?.(!1, !0, t); e !== this._$AB;) {
			let t = _(e).nextSibling;
			_(e).remove(), e = t;
		}
	}
	setConnected(e) {
		this._$AM === void 0 && (this._$Cv = e, this._$AP?.(e));
	}
}, H = class {
	get tagName() {
		return this.element.tagName;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	constructor(e, t, n, r, i) {
		this.type = 1, this._$AH = F, this._$AN = void 0, this.element = e, this.name = t, this._$AM = r, this.options = i, n.length > 2 || n[0] !== "" || n[1] !== "" ? (this._$AH = Array(n.length - 1).fill(/* @__PURE__ */ new String()), this.strings = n) : this._$AH = F;
	}
	_$AI(e, t = this, n, r) {
		let i = this.strings, a = !1;
		if (i === void 0) e = B(this, e, t, 0), a = !T(e) || e !== this._$AH && e !== P, a && (this._$AH = e);
		else {
			let r = e, o, s;
			for (e = i[0], o = 0; o < i.length - 1; o++) s = B(this, r[n + o], t, o), s === P && (s = this._$AH[o]), a ||= !T(s) || s !== this._$AH[o], s === F ? e = F : e !== F && (e += (s ?? "") + i[o + 1]), this._$AH[o] = s;
		}
		a && !r && this.j(e);
	}
	j(e) {
		e === F ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, e ?? "");
	}
}, ye = class extends H {
	constructor() {
		super(...arguments), this.type = 3;
	}
	j(e) {
		this.element[this.name] = e === F ? void 0 : e;
	}
}, be = class extends H {
	constructor() {
		super(...arguments), this.type = 4;
	}
	j(e) {
		this.element.toggleAttribute(this.name, !!e && e !== F);
	}
}, xe = class extends H {
	constructor(e, t, n, r, i) {
		super(e, t, n, r, i), this.type = 5;
	}
	_$AI(e, t = this) {
		if ((e = B(this, e, t, 0) ?? F) === P) return;
		let n = this._$AH, r = e === F && n !== F || e.capture !== n.capture || e.once !== n.once || e.passive !== n.passive, i = e !== F && (n === F || r);
		r && this.element.removeEventListener(this.name, this, n), i && this.element.addEventListener(this.name, this, e), this._$AH = e;
	}
	handleEvent(e) {
		typeof this._$AH == "function" ? this._$AH.call(this.options?.host ?? this.element, e) : this._$AH.handleEvent(e);
	}
}, Se = class {
	constructor(e, t, n) {
		this.element = e, this.type = 6, this._$AN = void 0, this._$AM = t, this.options = n;
	}
	get _$AU() {
		return this._$AM._$AU;
	}
	_$AI(e) {
		B(this, e);
	}
}, Ce = g.litHtmlPolyfillSupport;
Ce?.(z, V), (g.litHtmlVersions ??= []).push("3.3.3");
var we = (e, t, n) => {
	let r = n?.renderBefore ?? t, i = r._$litPart$;
	if (i === void 0) {
		let e = n?.renderBefore ?? null;
		r._$litPart$ = i = new V(t.insertBefore(w(), e), e, void 0, n ?? {});
	}
	return i._$AI(e), i;
}, U = globalThis, W = class extends h {
	constructor() {
		super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
	}
	createRenderRoot() {
		let e = super.createRenderRoot();
		return this.renderOptions.renderBefore ??= e.firstChild, e;
	}
	update(e) {
		let t = this.render();
		this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(e), this._$Do = we(t, this.renderRoot, this.renderOptions);
	}
	connectedCallback() {
		super.connectedCallback(), this._$Do?.setConnected(!0);
	}
	disconnectedCallback() {
		super.disconnectedCallback(), this._$Do?.setConnected(!1);
	}
	render() {
		return P;
	}
};
W._$litElement$ = !0, W.finalized = !0, U.litElementHydrateSupport?.({ LitElement: W });
var Te = U.litElementPolyfillSupport;
Te?.({ LitElement: W }), (U.litElementVersions ??= []).push("4.2.2");
//#endregion
//#region node_modules/@mdi/js/mdi.js
var Ee = "M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z", De = "M8.27,3L3,8.27V15.73L8.27,21H15.73C17.5,19.24 21,15.73 21,15.73V8.27L15.73,3M9.1,5H14.9L19,9.1V14.9L14.9,19H9.1L5,14.9V9.1M11,15H13V17H11V15M11,7H13V13H11V7", Oe = "M16.67,4H15V2H9V4H7.33A1.33,1.33 0 0,0 6,5.33V20.67C6,21.4 6.6,22 7.33,22H16.67A1.33,1.33 0 0,0 18,20.67V5.33C18,4.6 17.4,4 16.67,4Z", ke = "M16.67,4H15V2H9V4H7.33A1.33,1.33 0 0,0 6,5.33V20.66C6,21.4 6.6,22 7.33,22H16.66C17.4,22 18,21.4 18,20.67V5.33C18,4.6 17.4,4 16.67,4M11,20V14.5H9L13,7V12.5H15", Ae = "M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8M3.05,13H1V11H3.05C3.5,6.83 6.83,3.5 11,3.05V1H13V3.05C17.17,3.5 20.5,6.83 20.95,11H23V13H20.95C20.5,17.17 17.17,20.5 13,20.95V23H11V20.95C6.83,20.5 3.5,17.17 3.05,13M12,5A7,7 0 0,0 5,12A7,7 0 0,0 12,19A7,7 0 0,0 19,12A7,7 0 0,0 12,5Z", je = "M16.24,3.56L21.19,8.5C21.97,9.29 21.97,10.55 21.19,11.34L12,20.53C10.44,22.09 7.91,22.09 6.34,20.53L2.81,17C2.03,16.21 2.03,14.95 2.81,14.16L13.41,3.56C14.2,2.78 15.46,2.78 16.24,3.56M4.22,15.58L7.76,19.11C8.54,19.9 9.8,19.9 10.59,19.11L14.12,15.58L9.17,10.63L4.22,15.58Z", Me = "M17 4H20C21.1 4 22 4.9 22 6V8H20V6H17V4M4 8V6H7V4H4C2.9 4 2 4.9 2 6V8H4M20 16V18H17V20H20C21.1 20 22 19.1 22 18V16H20M7 18H4V16H2V18C2 19.1 2.9 20 4 20H7V18M16 10V14H8V10H16M18 8H6V16H18V8Z", Ne = "M22.7 14.3L21.7 15.3L19.7 13.3L20.7 12.3C20.8 12.2 20.9 12.1 21.1 12.1C21.2 12.1 21.4 12.2 21.5 12.3L22.8 13.6C22.9 13.8 22.9 14.1 22.7 14.3M13 19.9V22H15.1L21.2 15.9L19.2 13.9L13 19.9M11.21 15.83L9.25 13.47L6.5 17H13.12L15.66 14.55L13.96 12.29L11.21 15.83M11 19.9V19.05L11.05 19H5V5H19V11.31L21 9.38V5C21 3.9 20.11 3 19 3H5C3.9 3 3 3.9 3 5V19C3 20.11 3.9 21 5 21H11V19.9Z", Pe = "M4,1C2.89,1 2,1.89 2,3V7C2,8.11 2.89,9 4,9H1V11H13V9H10C11.11,9 12,8.11 12,7V3C12,1.89 11.11,1 10,1H4M4,3H10V7H4V3M14,13C12.89,13 12,13.89 12,15V19C12,20.11 12.89,21 14,21H11V23H23V21H20C21.11,21 22,20.11 22,19V15C22,13.89 21.11,13 20,13H14M3.88,13.46L2.46,14.88L4.59,17L2.46,19.12L3.88,20.54L6,18.41L8.12,20.54L9.54,19.12L7.41,17L9.54,14.88L8.12,13.46L6,15.59L3.88,13.46M14,15H20V19H14V15Z", Fe = "M11.62,1L17.28,6.67L15.16,8.79L13.04,6.67L11.62,8.09L13.95,10.41L12.79,11.58L13.24,12.04C14.17,11.61 15.31,11.77 16.07,12.54L12.54,16.07C11.77,15.31 11.61,14.17 12.04,13.24L11.58,12.79L10.41,13.95L8.09,11.62L6.67,13.04L8.79,15.16L6.67,17.28L1,11.62L3.14,9.5L5.26,11.62L6.67,10.21L3.84,7.38C3.06,6.6 3.06,5.33 3.84,4.55L4.55,3.84C5.33,3.06 6.6,3.06 7.38,3.84L10.21,6.67L11.62,5.26L9.5,3.14L11.62,1M18,14A4,4 0 0,1 14,18V16A2,2 0 0,0 16,14H18M22,14A8,8 0 0,1 14,22V20A6,6 0 0,0 20,14H22Z", Ie = "M23,12H17V10L20.39,6H17V4H23V6L19.62,10H23V12M15,16H9V14L12.39,10H9V8H15V10L11.62,14H15V16M7,20H1V18L4.39,14H1V12H7V14L3.62,18H7V20Z";
//#endregion
//#region src/feedback.ts
function Le(e) {
	if (e && typeof e == "object") {
		let { x: t, y: n } = e;
		if (typeof t == "number" && typeof n == "number" && Number.isFinite(t) && Number.isFinite(n)) return [t, n];
	}
	return null;
}
function Re(e) {
	if (!Array.isArray(e)) return [];
	let t = [];
	for (let n of e) {
		let e = Le(n);
		e && t.push(e);
	}
	return t;
}
function ze(e) {
	let t = {
		visited: [],
		remaining: []
	}, n = e?.cleanPathProgress;
	if (!Array.isArray(n)) return t;
	for (let e of n) {
		let n = Re(e?.path);
		if (n.length < 2) continue;
		let r = Number(e.clean_index), i = Number.isFinite(r) ? Math.max(0, Math.min(n.length - 1, Math.floor(r))) : 0;
		i > 0 && t.visited.push(n.slice(0, i + 1)), i < n.length - 1 && t.remaining.push(n.slice(i));
	}
	return t;
}
function Be(e, t = 0) {
	if (t > 4 || !e || typeof e != "object") return [];
	let n = Array.isArray(e) ? Re(e) : [];
	for (let r of Object.values(e)) {
		let e = Be(r, t + 1);
		e.length > n.length && (n = e);
	}
	return n;
}
function Ve(e) {
	return Array.isArray(e) && typeof e[0] == "number" && typeof e[1] == "number" ? [e[0], e[1]] : Le(e);
}
function He(e) {
	let t = Array.isArray(e) ? e : e?.points;
	return Array.isArray(t) ? t.map(Ve).filter((e) => e !== null) : [];
}
function G(e) {
	let t = {
		runId: null,
		planName: null,
		active: !1,
		barriers: [],
		detections: []
	};
	if (Array.isArray(e)) return t.barriers = e.map(He).filter((e) => e.length > 0), t;
	if (!e || typeof e != "object") return t;
	let n = e;
	if (t.runId = typeof n.id == "string" ? n.id : null, t.planName = typeof n.plan_name == "string" ? n.plan_name : null, t.active = n.ended === null || n.ended === void 0, Array.isArray(n.barriers) && (t.barriers = n.barriers.map(He).filter((e) => e.length > 0)), Array.isArray(n.detections)) for (let e of n.detections) {
		let n = e, r = Ve(n.point);
		r && t.detections.push({
			point: r,
			source: typeof n.source == "string" ? n.source : "unknown",
			distance_m: typeof n.distance_m == "number" ? n.distance_m : null,
			t: typeof n.t == "number" ? n.t : null,
			count: typeof n.count == "number" ? n.count : 1
		});
	}
	return t;
}
//#endregion
//#region src/geometry.ts
var K = (e, t) => [-e, -t];
function Ue(e, t) {
	let n = Math.cos(t), r = Math.sin(t);
	return [e[0] * n - e[1] * r, e[0] * r + e[1] * n];
}
function We(e, t) {
	let n = [Math.cos(t), Math.sin(t)], r = [-n[1], n[0]], i = (t, i) => [e[0] + n[0] * t + r[0] * i, e[1] + n[1] * t + r[1] * i], a = .315;
	return {
		dock: [
			i(-.51, -.315),
			i(-.51, a),
			i(.36, a),
			i(.36, -.315)
		],
		guard: [
			i(-1.075, -1),
			i(-1.075, 1),
			i(.925, 1),
			i(.925, -1)
		]
	};
}
function Ge(e, t, n) {
	return [
		[.88, 0],
		[.55, .275],
		[-.42, .275],
		[-.42, -.275],
		[.55, -.275]
	].map((r) => {
		let i = Ue(r, n);
		return [e + i[0], t + i[1]];
	});
}
function Ke(e, t, n, r) {
	let i = [t[0] - e[0], t[1] - e[1]], a = [r[0] - n[0], r[1] - n[1]], o = i[0] * i[0] + i[1] * i[1];
	if (o < 1e-9) return null;
	let s = (a[0] * i[0] + a[1] * i[1]) / o, c = (a[1] * i[0] - a[0] * i[1]) / o;
	return {
		a: s,
		b: c,
		e: n[0] - (s * e[0] - c * e[1]),
		f: n[1] - (c * e[0] + s * e[1])
	};
}
function qe(e, t) {
	return [e.a * t[0] - e.b * t[1] + e.e, e.b * t[0] + e.a * t[1] + e.f];
}
function Je(e, t) {
	let n = e.a * e.a + e.b * e.b, r = t[0] - e.e, i = t[1] - e.f;
	return [(e.a * r + e.b * i) / n, (-e.b * r + e.a * i) / n];
}
function Ye(e) {
	return `matrix(${e.a} ${e.b} ${-e.b} ${e.a} ${e.e} ${e.f})`;
}
function Xe(e, t) {
	let n = !1;
	for (let r = 0, i = t.length - 1; r < t.length; i = r++) {
		let [a, o] = t[r], [s, c] = t[i];
		o > e[1] != c > e[1] && e[0] < (s - a) * (e[1] - o) / (c - o) + a && (n = !n);
	}
	return n;
}
function Ze(e, t) {
	let n = Infinity;
	for (let r = 1; r < t.length; r++) {
		let i = t[r - 1], a = t[r], o = a[0] - i[0], s = a[1] - i[1], c = o * o + s * s, l = c === 0 ? 0 : Math.max(0, Math.min(1, ((e[0] - i[0]) * o + (e[1] - i[1]) * s) / c));
		n = Math.min(n, Math.hypot(e[0] - (i[0] + l * o), e[1] - (i[1] + l * s)));
	}
	return n;
}
function Qe(e, t, n = .15, r = 5e3) {
	let i = e[e.length - 1];
	if (i && Math.hypot(t.x - i.x, t.y - i.y) < n && i.reverse === t.reverse && i.working === t.working) return e;
	let a = e.length >= r ? e.slice(e.length - r + 1) : e.slice();
	return a.push(t), a;
}
function $e(e) {
	let t = [];
	for (let n of e) {
		let e = [n.x, n.y], r = t[t.length - 1];
		if (r && r.reverse === n.reverse && r.working === n.working) {
			r.points.push(e);
			continue;
		}
		let i = r ? r.points[r.points.length - 1] : void 0;
		t.push({
			points: i ? [i, e] : [e],
			reverse: n.reverse,
			working: n.working
		});
	}
	return t.filter((e) => e.points.length >= 2);
}
function et(e) {
	let t = e / 5;
	return [
		.5,
		1,
		2,
		5,
		10,
		20,
		50,
		100,
		200,
		500
	].find((e) => e >= t) ?? 1e3;
}
//#endregion
//#region src/status.ts
var tt = {
	sleeping: "Sleeping",
	idle: "Idle",
	calculating_route: "Calculating route",
	heading_to_area: "Heading to area",
	working: "Working",
	waypoint: "Waypoint",
	completed: "Completed",
	paused: "Paused",
	returning: "Returning",
	charging: "Charging",
	error: "Fault"
}, nt = {
	manual: "Paused by you",
	low_battery_recharging: "Paused: low battery",
	power_restart: "Paused: power restart",
	emergency_stop: "Emergency stop",
	bumper: "Paused: bumper hit",
	stuck: "Stuck",
	fault: "Paused: fault"
};
function q(e) {
	return e.fault ? e.fault : e.error_code ? {
		code: e.error_code,
		key: null,
		description: `Fault ${e.error_code}`,
		hint: "Update Yarbo Local to see what this fault means, or check the Yarbo app.",
		since: null
	} : null;
}
function rt(e) {
	let t = q(e);
	return t ? t.description : e.activity === "paused" && e.pause_reason ? nt[e.pause_reason] ?? "Paused" : tt[e.activity] ?? e.activity;
}
function it(e, t, n = /* @__PURE__ */ new Date()) {
	let r = [];
	if (e.key && r.push(`Fault ${e.code}`), e.since) {
		let i = /* @__PURE__ */ new Date(e.since * 1e3), a = i.toDateString() === n.toDateString() ? i.toLocaleTimeString(t, {
			hour: "numeric",
			minute: "2-digit"
		}) : i.toLocaleString(t, {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit"
		});
		r.push(`since ${a}`);
	}
	return r.join(" · ");
}
//#endregion
//#region src/styles.ts
var at = l`
  :host {
    display: block;
    --yl-area: var(--yarbo-area-color, var(--primary-color, #1e88e5));
    --yl-nogo: var(--yarbo-nogo-color, var(--error-color, #db4437));
    --yl-novision: var(--yarbo-novision-color, #8e5bd6);
    --yl-path: var(--yarbo-path-color, var(--warning-color, #ffa000));
    --yl-sidewalk: var(--yarbo-sidewalk-color, #00a39a);
    --yl-dock: var(--yarbo-dock-color, var(--success-color, #43a047));
    --yl-robot: var(--yarbo-robot-color, var(--primary-color, #1e88e5));
    --yl-trail: var(--yarbo-trail-color, var(--primary-color, #1e88e5));
    --yl-reverse: var(--yarbo-reverse-color, #d63fd6);
    --yl-ink: var(--primary-text-color, #1c1f24);
    --yl-muted: var(--secondary-text-color, #5f6670);
    --yl-ground: var(--secondary-background-color, #eef0f2);
    --yl-surface: var(--card-background-color, #ffffff);
    --yl-divider: var(--divider-color, rgba(0, 0, 0, 0.12));
  }
  ha-card {
    overflow: hidden;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px 10px;
    flex-wrap: wrap;
  }
  .title {
    font-size: 1.1rem;
    font-weight: 500;
    color: var(--yl-ink);
    margin-right: auto;
    line-height: 1.3;
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 26px;
    padding: 0 10px 0 8px;
    border-radius: 13px;
    background: var(--yl-ground);
    color: var(--yl-ink);
    font-size: 0.8rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .chip svg {
    width: 16px;
    height: 16px;
    fill: currentColor;
    flex: none;
  }
  .chip.good {
    color: var(--success-color, #2e7d32);
  }
  .chip.warn {
    color: var(--warning-color, #b26a00);
  }
  .chip.bad {
    color: var(--error-color, #c62828);
  }
  .fault {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 16px 12px;
    background: color-mix(in srgb, var(--error-color, #c62828) 12%, var(--yl-surface));
    color: var(--yl-ink);
    border-top: 1px solid color-mix(in srgb, var(--error-color, #c62828) 30%, transparent);
  }
  .fault > svg {
    width: 22px;
    height: 22px;
    flex: none;
    fill: var(--error-color, #c62828);
    margin-top: 1px;
  }
  .fault-text {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .fault-title {
    font-weight: 600;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 8px;
  }
  .fault-detail {
    font-weight: 400;
    font-size: 0.85rem;
    color: var(--yl-muted);
    font-variant-numeric: tabular-nums;
  }
  .fault-hint {
    font-size: 0.9rem;
  }
  .map {
    position: relative;
    background: var(--yl-ground);
    touch-action: none;
    user-select: none;
    cursor: grab;
  }
  .map.dragging {
    cursor: grabbing;
  }
  .map.picking {
    cursor: crosshair;
  }
  .map > svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .placeholder {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--yl-muted);
    padding: 24px;
    text-align: center;
  }
  .controls {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .controls button,
  .panel button {
    font: inherit;
  }
  .icon-button {
    width: 36px;
    height: 36px;
    border-radius: 18px;
    border: 1px solid var(--yl-divider);
    background: var(--yl-surface);
    color: var(--yl-ink);
    display: grid;
    place-items: center;
    cursor: pointer;
    padding: 0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  }
  .icon-button svg {
    width: 20px;
    height: 20px;
    fill: currentColor;
  }
  .icon-button.active {
    background: var(--primary-color, #1e88e5);
    color: var(--text-primary-color, #fff);
    border-color: transparent;
  }
  .icon-button:focus-visible,
  .panel button:focus-visible,
  .panel input:focus-visible {
    outline: 2px solid var(--primary-color, #1e88e5);
    outline-offset: 2px;
  }
  .scale {
    position: absolute;
    left: 12px;
    bottom: 10px;
    font-size: 0.75rem;
    color: var(--yl-ink);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
  }
  .scale .bar {
    height: 4px;
    border: 2px solid var(--yl-ink);
    border-top: none;
    margin-top: 2px;
  }
  .north {
    position: absolute;
    right: 58px;
    top: 14px;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--yl-ink);
    display: grid;
    justify-items: center;
    pointer-events: none;
  }
  .north svg {
    width: 14px;
    height: 16px;
    fill: var(--yl-ink);
  }
  .info {
    position: absolute;
    left: 12px;
    top: 12px;
    background: var(--yl-surface);
    color: var(--yl-ink);
    border-radius: 10px;
    padding: 8px 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
    font-size: 0.85rem;
    max-width: 60%;
  }
  .info .muted {
    color: var(--yl-muted);
  }
  .panel {
    position: absolute;
    left: 12px;
    right: 58px;
    bottom: 12px;
    background: var(--yl-surface);
    color: var(--yl-ink);
    border-radius: 12px;
    padding: 12px 14px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    display: grid;
    gap: 8px;
    font-size: 0.9rem;
  }
  .panel .row {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
  }
  .panel input[type="text"] {
    flex: 1;
    min-width: 160px;
    font: inherit;
    padding: 6px 8px;
    border-radius: 6px;
    border: 1px solid var(--yl-divider);
    background: var(--yl-ground);
    color: var(--yl-ink);
  }
  .panel button {
    padding: 6px 12px;
    border-radius: 18px;
    border: 1px solid var(--yl-divider);
    background: var(--yl-surface);
    color: var(--yl-ink);
    cursor: pointer;
  }
  .panel button.primary {
    background: var(--primary-color, #1e88e5);
    color: var(--text-primary-color, #fff);
    border-color: transparent;
  }
  .panel .step {
    font-weight: 500;
  }
  .panel .hint {
    color: var(--yl-muted);
    font-size: 0.82rem;
  }
  .panel .error {
    color: var(--error-color, #c62828);
  }
  svg .zone {
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
  }
  svg .zone.areas {
    fill: color-mix(in srgb, var(--yl-area) 22%, transparent);
    stroke: var(--yl-area);
  }
  svg .zone.nogozones {
    fill: color-mix(in srgb, var(--yl-nogo) 26%, transparent);
    stroke: var(--yl-nogo);
  }
  svg .zone.novisionzones {
    fill: color-mix(in srgb, var(--yl-novision) 20%, transparent);
    stroke: var(--yl-novision);
  }
  svg .zone.elec_fence {
    fill: none;
    stroke: var(--yl-path);
    stroke-dasharray: 6 4;
  }
  svg .zone.disabled {
    opacity: 0.45;
  }
  svg .zone.selected {
    stroke-width: 4px;
  }
  svg .line {
    fill: none;
    stroke-width: 4px;
    vector-effect: non-scaling-stroke;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 10 7;
  }
  svg .line.pathways {
    stroke: var(--yl-path);
  }
  svg .line.sidewalks {
    stroke: var(--yl-sidewalk);
  }
  svg .line.deadends {
    stroke: var(--yl-muted);
  }
  svg .line.selected {
    stroke-width: 7px;
  }
  svg .dock {
    fill: var(--yl-dock);
    stroke: var(--yl-surface);
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
  }
  svg .guard {
    fill: none;
    stroke: var(--yl-dock);
    stroke-width: 1.5px;
    stroke-dasharray: 4 4;
    vector-effect: non-scaling-stroke;
  }
  svg .trail {
    fill: none;
    stroke: var(--yl-trail);
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.55;
  }
  svg .trail.thin {
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
  }
  svg .trail.reverse {
    stroke: var(--yl-reverse);
  }
  svg .plan-visited {
    fill: none;
    stroke: var(--yl-trail);
    stroke-width: 3px;
    vector-effect: non-scaling-stroke;
    opacity: 0.8;
  }
  svg .plan-remaining {
    fill: none;
    stroke: var(--yl-muted);
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
    opacity: 0.35;
  }
  svg .route {
    fill: none;
    stroke: var(--yl-dock);
    stroke-width: 3px;
    vector-effect: non-scaling-stroke;
    stroke-dasharray: 8 5;
  }
  svg .obstacle {
    fill: none;
    stroke: var(--yl-nogo);
    stroke-width: 4px;
    vector-effect: non-scaling-stroke;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  svg .obstacle-dot {
    fill: var(--yl-nogo);
  }
  svg .detection {
    fill: color-mix(in srgb, var(--yl-path) 70%, transparent);
    stroke: var(--yl-surface);
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
  }
  svg .detection.selected {
    fill: var(--yl-path);
    stroke: var(--yl-ink);
    stroke-width: 2.5px;
  }
  svg .obstacle-ring {
    fill: color-mix(in srgb, var(--yl-nogo) 22%, transparent);
    stroke: var(--yl-nogo);
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
  }
  svg .robot {
    fill: var(--yl-robot);
    stroke: var(--yl-surface);
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
  }
  svg .robot-halo {
    fill: color-mix(in srgb, var(--yl-robot) 25%, transparent);
    stroke: var(--yl-robot);
    stroke-width: 1.5px;
    vector-effect: non-scaling-stroke;
  }
  svg .robot.fault {
    fill: var(--error-color, #c62828);
  }
  svg .robot-halo.fault {
    fill: color-mix(in srgb, var(--error-color, #c62828) 25%, transparent);
    stroke: var(--error-color, #c62828);
  }
  svg .robot.asleep {
    fill: var(--yl-muted);
  }
  svg .label {
    fill: var(--yl-ink);
    stroke: var(--yl-surface);
    paint-order: stroke;
    stroke-linejoin: round;
    font-family: var(--ha-font-family-body, system-ui, sans-serif);
    font-weight: 500;
    text-anchor: middle;
    dominant-baseline: middle;
  }
  svg .grid line {
    stroke: var(--yl-muted);
    stroke-opacity: 0.16;
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
  }
  svg .pick {
    fill: var(--primary-color, #1e88e5);
    stroke: var(--yl-surface);
    stroke-width: 2px;
    vector-effect: non-scaling-stroke;
  }
  .dim {
    opacity: 0.25;
  }
`, ot = 2e3;
function J(e, t) {
	let n = e.width * (t.h / Math.max(1, t.w));
	return [
		e.cx - e.width / 2,
		e.cy - n / 2,
		e.width,
		n
	];
}
function st(e, t, n = .12) {
	let [r, i, a, o] = e, s = Math.max(a - r, 4), c = Math.max(o - i, 4), l = t.w / Math.max(1, t.h), u = Math.max(s, c * l) * (1 + n * 2);
	return {
		cx: (r + a) / 2,
		cy: (i + o) / 2,
		width: ct(u)
	};
}
function ct(e) {
	return Math.min(ot, Math.max(2, e));
}
function Y(e, t, n) {
	let r = ct(e.width * t), i = r / e.width;
	return {
		cx: n[0] + (e.cx - n[0]) * i,
		cy: n[1] + (e.cy - n[1]) * i,
		width: r
	};
}
function X(e, t, n, r) {
	let [i, a, o, s] = J(e, t);
	return [i + n / Math.max(1, t.w) * o, a + r / Math.max(1, t.h) * s];
}
function Z(e, t) {
	return e.width / Math.max(1, t.w);
}
//#endregion
//#region src/editor.ts
var lt = [
	{
		name: "entity",
		required: !0,
		selector: { entity: { filter: { integration: "yarbo_local" } } }
	},
	{
		name: "title",
		selector: { text: {} }
	},
	{
		type: "grid",
		name: "",
		schema: [
			{
				name: "height",
				selector: { number: {
					min: 200,
					max: 1400,
					step: 20,
					mode: "box",
					unit_of_measurement: "px"
				} }
			},
			{
				name: "trail",
				selector: { boolean: {} }
			},
			{
				name: "follow",
				selector: { boolean: {} }
			},
			{
				name: "show_status",
				selector: { boolean: {} }
			}
		]
	}
], ut = {
	entity: "Robot (any Yarbo Local entity)",
	title: "Title",
	height: "Map height",
	trail: "Show trail",
	follow: "Follow the robot",
	show_status: "Show status chips"
}, dt = class extends W {
	static properties = {
		hass: { attribute: !1 },
		_config: { state: !0 }
	};
	setConfig(e) {
		this._config = e;
	}
	render() {
		return !this.hass || !this._config ? F : M`<ha-form
      .hass=${this.hass}
      .data=${this._config}
      .schema=${lt}
      .computeLabel=${(e) => ut[e.name] ?? e.name}
      @value-changed=${this._changed}
    ></ha-form>`;
	}
	_changed(e) {
		this.dispatchEvent(new CustomEvent("config-changed", {
			detail: { config: e.detail.value },
			bubbles: !0,
			composed: !0
		}));
	}
};
customElements.get("yarbo-local-card-editor") || customElements.define("yarbo-local-card-editor", dt);
//#endregion
//#region src/yarbo-local-card.ts
var ft = .55, pt = 6, mt = 14, Q = (e) => N`<svg viewBox="0 0 24 24" aria-hidden="true"><path d=${e}></path></svg>`, $ = (e) => e.map(([e, t]) => `${-e},${-t}`).join(" "), ht = class extends W {
	static styles = at;
	static properties = {
		hass: { attribute: !1 },
		_config: { state: !0 },
		_map: { state: !0 },
		_live: { state: !0 },
		_view: { state: !0 },
		_size: { state: !0 },
		_trail: { state: !0 },
		_feedback: { state: !0 },
		_background: { state: !0 },
		_selected: { state: !0 },
		_selectedObstacle: { state: !0 },
		_follow: { state: !0 },
		_align: { state: !0 },
		_error: { state: !0 },
		_dragging: { state: !0 }
	};
	_unsubscribe;
	_target;
	_resize;
	_measured = !1;
	_pointers = /* @__PURE__ */ new Map();
	_gesture;
	constructor() {
		super(), this._size = {
			w: 600,
			h: 440
		}, this._trail = [], this._feedback = {}, this._follow = !1, this._dragging = !1;
	}
	setConfig(t) {
		e(t), this._config = {
			trail: !0,
			follow: !1,
			show_status: !0,
			height: 440,
			...t
		}, this._follow = !!this._config.follow;
	}
	getCardSize() {
		return n(this._config);
	}
	getGridOptions() {
		return t(this._config);
	}
	connectedCallback() {
		if (super.connectedCallback(), this._target) {
			let e = this._target;
			this._target = void 0, this._connect(e);
		}
	}
	disconnectedCallback() {
		super.disconnectedCallback(), this._resize?.disconnect(), this._resize = void 0, this._teardown();
	}
	updated(e) {
		let t = this._config?.entity;
		if (this.hass && t && t !== this._target && this._connect(t), !this._resize) {
			let e = this.renderRoot.querySelector(".map");
			e && (this._resize = new ResizeObserver((e) => {
				let t = e[0]?.contentRect;
				t && t.width !== 0 && t.height !== 0 && ((t.width !== this._size.w || t.height !== this._size.h) && (this._size = {
					w: t.width,
					h: t.height
				}), this._measured || (this._measured = !0, this._map && this._fit()));
			}), this._resize.observe(e));
		}
		e.has("_map") && this._map && !this._view && this._measured && this._fit();
	}
	async _teardown() {
		let e = this._unsubscribe;
		if (this._unsubscribe = void 0, e) try {
			await e();
		} catch {}
	}
	async _connect(e) {
		let t = this.hass;
		if (t) {
			this._target = e, await this._teardown(), this._error = void 0, this._map = void 0, this._view = void 0, this._trail = [], this._feedback = {};
			try {
				let [n, r] = await Promise.all([t.callWS({
					type: "yarbo_local/map",
					entity_id: e
				}), t.callWS({
					type: "yarbo_local/background/get",
					entity_id: e
				})]);
				if (this._target !== e) return;
				this._map = n, this._background = r, this._unsubscribe = await t.connection.subscribeMessage((e) => this._onEvent(e), {
					type: "yarbo_local/subscribe_live",
					entity_id: e
				});
			} catch (e) {
				this._error = `Could not load the Yarbo map: ${e.message ?? String(e)}`;
			}
		}
	}
	_onEvent(e) {
		if (e.type === "live") {
			if (this._live = e, e.x !== null && e.y !== null && this._config?.trail !== !1) {
				let t = e.plan_running && e.activity === "working";
				this._trail = Qe(this._trail, {
					x: e.x,
					y: e.y,
					t: e.t,
					reverse: e.reverse,
					working: t
				});
			}
			if (this._follow && e.x !== null && e.y !== null && this._view && !this._gesture) {
				let [t, n] = K(e.x, e.y);
				this._view = {
					...this._view,
					cx: t,
					cy: n
				};
			}
		} else if (e.type === "map_changed") {
			let e = this._target;
			this.hass && e && this.hass.callWS({
				type: "yarbo_local/map",
				entity_id: e
			}).then((t) => {
				this._target === e && (this._map = t);
			});
		} else if (e.type === "feedback") {
			let t = { ...this._feedback };
			e.data === null || e.data === void 0 ? delete t[e.leaf] : t[e.leaf] = e.data, this._feedback = t;
		}
	}
	_fit() {
		let e = this._map?.bounds, t = this._live && this._live.x !== null && this._live.y !== null ? K(this._live.x, this._live.y) : null, n = e ? [
			-e[2],
			-e[3],
			-e[0],
			-e[1]
		] : null;
		t && (n = n ? [
			Math.min(n[0], t[0]),
			Math.min(n[1], t[1]),
			Math.max(n[2], t[0]),
			Math.max(n[3], t[1])
		] : [
			t[0] - 5,
			t[1] - 5,
			t[0] + 5,
			t[1] + 5
		]), this._view = st(n ?? [
			-10,
			-10,
			10,
			10
		], this._size);
	}
	_toggleFollow() {
		if (this._follow = !this._follow, this._follow && this._view && this._live?.x != null && this._live.y != null) {
			let [e, t] = K(this._live.x, this._live.y);
			this._view = {
				...this._view,
				cx: e,
				cy: t
			};
		}
	}
	_local(e) {
		let t = e.currentTarget.getBoundingClientRect();
		return {
			px: e.clientX - t.left,
			py: e.clientY - t.top
		};
	}
	_onWheel(e) {
		if (!this._view) return;
		e.preventDefault();
		let { px: t, py: n } = this._local(e), r = X(this._view, this._size, t, n);
		this._view = Y(this._view, Math.exp(e.deltaY * .0015), r);
	}
	_onPointerDown(e) {
		if (!this._view || e.target.closest(".controls, .panel, .info")) return;
		e.currentTarget.setPointerCapture(e.pointerId);
		let { px: t, py: n } = this._local(e);
		if (this._pointers.set(e.pointerId, {
			x: t,
			y: n
		}), this._pointers.size === 1) this._gesture = {
			startX: t,
			startY: n,
			view: this._view,
			moved: !1
		};
		else if (this._pointers.size === 2 && this._gesture) {
			let [e, t] = [...this._pointers.values()];
			this._gesture = {
				...this._gesture,
				view: this._view,
				pinch: Math.hypot(e.x - t.x, e.y - t.y),
				moved: !0
			};
		}
	}
	_onPointerMove(e) {
		let t = this._gesture;
		if (!t || !this._pointers.has(e.pointerId)) return;
		let { px: n, py: r } = this._local(e);
		if (this._pointers.set(e.pointerId, {
			x: n,
			y: r
		}), this._pointers.size >= 2 && t.pinch) {
			let [e, n] = [...this._pointers.values()], r = Math.hypot(e.x - n.x, e.y - n.y), i = X(t.view, this._size, (e.x + n.x) / 2, (e.y + n.y) / 2);
			this._view = Y(t.view, t.pinch / Math.max(1, r), i);
			return;
		}
		let i = n - t.startX, a = r - t.startY;
		if (!t.moved && Math.hypot(i, a) < pt) return;
		t.moved = !0, this._dragging = !0, this._follow = !1;
		let o = Z(t.view, this._size);
		this._view = {
			...t.view,
			cx: t.view.cx - i * o,
			cy: t.view.cy - a * o
		};
	}
	_onPointerUp(e) {
		let t = this._gesture;
		if (this._pointers.delete(e.pointerId), !(this._pointers.size > 0) && (this._gesture = void 0, this._dragging = !1, t && !t.moved && this._view && e.type === "pointerup")) {
			let { px: t, py: n } = this._local(e);
			this._tap(X(this._view, this._size, t, n));
		}
	}
	_tap(e) {
		if (this._align) {
			this._pick(e);
			return;
		}
		let t = [-e[0], -e[1]], n = this._view ? Z(this._view, this._size) : .05, r = G(this._feedback.obstacles).detections.map((e) => ({
			d: e,
			dist: Math.hypot(e.point[0] - t[0], e.point[1] - t[1])
		})).filter((e) => e.dist < Math.max(.4, 14 * n)).sort((e, t) => e.dist - t.dist)[0];
		if (r) {
			this._selected = void 0, this._selectedObstacle = r.d === this._selectedObstacle ? void 0 : r.d;
			return;
		}
		this._selectedObstacle = void 0;
		let i = this._map?.zones ?? [], a = i.find((e) => !e.closed && Ze(t, e.points) < 10 * n), o = i.filter((e) => e.closed && Xe(t, e.points)), s = a ?? o.sort((e, t) => (e.area_m2 ?? 0) - (t.area_m2 ?? 0))[0];
		this._selected = s && s === this._selected ? void 0 : s;
	}
	_startAlign() {
		this._selected = void 0, this._align = {
			step: "url",
			url: this._background?.image ?? "/local/yarbo/aerial.jpg",
			opacity: this._background?.opacity ?? .85
		};
	}
	_loadAlignImage() {
		let e = this._align;
		if (!e || !this._view) return;
		this._align = {
			...e,
			busy: !0,
			error: void 0
		};
		let t = new Image();
		t.onload = () => {
			let e = this._view, [n, r, i, a] = J(e, this._size), o = Math.min(i / t.naturalWidth, a / t.naturalHeight), s = {
				a: o,
				b: 0,
				e: n + (i - t.naturalWidth * o) / 2,
				f: r + (a - t.naturalHeight * o) / 2
			};
			this._align = {
				...this._align,
				busy: !1,
				step: "photo1",
				width: t.naturalWidth,
				height: t.naturalHeight,
				placement: s
			};
		}, t.onerror = () => {
			this._align = {
				...this._align,
				busy: !1,
				error: `Could not load ${e.url}. Put the file in /config/www and use /local/…`
			};
		}, t.src = e.url;
	}
	_snap(e) {
		let t = this._view ? Z(this._view, this._size) : .05, n = e, r = mt * t, i = [];
		for (let e of this._map?.zones ?? []) i.push(...e.points.map(([e, t]) => K(e, t)));
		for (let e of this._map?.docks ?? []) i.push(K(e.point[0], e.point[1]));
		for (let t of i) {
			let i = Math.hypot(t[0] - e[0], t[1] - e[1]);
			i < r && (n = t, r = i);
		}
		return n;
	}
	_pick(e) {
		let t = this._align;
		if (!t?.placement) return;
		let n = Je(t.placement, e);
		switch (t.step) {
			case "photo1":
				this._align = {
					...t,
					u1: n,
					step: "map1"
				};
				break;
			case "map1":
				this._align = {
					...t,
					w1: this._snap(e),
					step: "photo2"
				};
				break;
			case "photo2":
				this._align = {
					...t,
					u2: n,
					step: "map2"
				};
				break;
			case "map2": {
				let n = this._snap(e), r = t.u1 && t.u2 && t.w1 ? Ke(t.u1, t.u2, t.w1, n) : null;
				this._align = r ? {
					...t,
					w2: n,
					result: r,
					step: "preview",
					error: void 0
				} : {
					...t,
					step: "photo2",
					u2: void 0,
					error: "The two photo points are the same. Pick two landmarks far apart."
				};
				break;
			}
		}
	}
	async _saveAlign() {
		let e = this._align;
		if (!e?.result || !e.width || !e.height || !this.hass || !this._target) return;
		let t = {
			image: e.url,
			transform: e.result,
			width: e.width,
			height: e.height,
			opacity: e.opacity
		};
		this._align = {
			...e,
			busy: !0
		};
		try {
			this._background = await this.hass.callWS({
				type: "yarbo_local/background/save",
				entity_id: this._target,
				background: t
			}), this._align = void 0;
		} catch (t) {
			this._align = {
				...e,
				busy: !1,
				error: t.message ?? "Saving failed"
			};
		}
	}
	async _clearBackground() {
		this.hass && this._target && (await this.hass.callWS({
			type: "yarbo_local/background/clear",
			entity_id: this._target
		}), this._background = null, this._align = void 0);
	}
	render() {
		if (!this._config) return F;
		let e = this._config.height ?? 440, t = !!(this._align && this._align.step !== "url" && this._align.step !== "preview");
		return M`<ha-card>
      ${this._renderHeader()}
      ${this._renderFault()}
      <div
        class="map ${this._dragging ? "dragging" : ""} ${t ? "picking" : ""}"
        style="height:${e}px"
        @wheel=${this._onWheel}
        @pointerdown=${this._onPointerDown}
        @pointermove=${this._onPointerMove}
        @pointerup=${this._onPointerUp}
        @pointercancel=${this._onPointerUp}
      >
        ${this._map && this._view ? this._renderSvg() : M`<div class="placeholder">${this._error ?? "Loading the map from the robot…"}</div>`}
        ${this._map && this._view ? this._renderFurniture() : F}
        ${this._renderControls()} ${this._renderInfo()} ${this._renderAlignPanel()}
      </div>
    </ha-card>`;
	}
	_renderHeader() {
		let e = this._live, t = this._config?.title ?? this._map?.title ?? "Yarbo";
		if (this._config?.show_status === !1) return M`<div class="header"><div class="title">${t}</div></div>`;
		let n = e?.fix_quality, r = n === 4 ? {
			label: "RTK fixed",
			cls: "good"
		} : n === 5 ? {
			label: "RTK float",
			cls: "warn"
		} : n ? {
			label: "GPS only",
			cls: "warn"
		} : {
			label: "No fix",
			cls: "bad"
		};
		return M`<div class="header">
      <div class="title">${t}</div>
      <div class="chips">
        ${e && !e.connected ? M`<span class="chip bad">${Q(Pe)}Offline</span>` : F}
        ${e ? M`<span class="chip ${q(e) ? "bad" : ""}"
              >${q(e) ? Q(Ee) : e.awake === !1 ? Q(Ie) : F}${rt(e)}</span
            >` : F}
        ${this._obstacleCount() > 0 ? M`<span class="chip warn" title=${this._obstacleTitle()}>${Q(De)}${this._obstacleCount()}</span>` : F}
        ${e?.battery == null ? F : M`<span class="chip ${e.battery < 20 ? "bad" : ""}"
              >${Q(e.charging ? ke : Oe)}${e.battery}%</span
            >`}
        ${e ? M`<span class="chip ${r.cls}"
              >${Q(Fe)}${r.label}${e.satellites ? M` · ${e.satellites}` : F}</span
            >` : F}
      </div>
    </div>`;
	}
	_renderFault() {
		let e = this._live ? q(this._live) : null;
		if (!e) return F;
		let t = it(e, this.hass?.locale?.language);
		return M`<div class="fault" role="alert">
      ${Q(Ee)}
      <div class="fault-text">
        <div class="fault-title">${e.description}${t ? M`<span class="fault-detail">${t}</span>` : F}</div>
        <div class="fault-hint">${e.hint}</div>
      </div>
    </div>`;
	}
	_renderSvg() {
		let e = this._view, t = this._map, [n, r, i, a] = J(e, this._size), o = Z(e, this._size), s = this._align, c = s && (s.step === "photo1" || s.step === "photo2");
		return M`<svg viewBox="${n} ${r} ${i} ${a}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Map of ${t.title}">
      ${this._renderBackground()} ${this._renderGrid(n, r, i, a)}
      <g class=${c ? "dim" : ""}>
        ${t.zones.filter((e) => e.closed).map((e) => this._renderZone(e))}
        ${t.zones.filter((e) => !e.closed).map((e) => this._renderZone(e))} ${this._renderDocks()}
        ${this._renderFeedback(o)} ${this._renderTrail()} ${this._renderRobot(o)} ${this._renderLabels(o)}
      </g>
      ${this._renderPicks(o)}
    </svg>`;
	}
	_renderBackground() {
		let e = this._align;
		if (e?.width && e.height) {
			let t = e.step === "photo1" || e.step === "photo2", n = e.step === "preview" && e.result ? e.result : e.placement;
			if (!n) return F;
			let r = t ? 1 : e.step === "preview" ? e.opacity : .35;
			return N`<image href=${e.url} width=${e.width} height=${e.height} transform=${Ye(n)}
        opacity=${r} preserveAspectRatio="none"></image>`;
		}
		let t = this._background;
		return t ? N`<image href=${t.image} width=${t.width} height=${t.height} transform=${Ye(t.transform)}
      opacity=${t.opacity} preserveAspectRatio="none"></image>` : F;
	}
	_renderGrid(e, t, n, r) {
		if (this._background && !this._align) return F;
		let i = et(Math.max(n, r)), a = [];
		for (let o = Math.ceil(e / i) * i; o < e + n; o += i) a.push(N`<line x1=${o} y1=${t} x2=${o} y2=${t + r}></line>`);
		for (let o = Math.ceil(t / i) * i; o < t + r; o += i) a.push(N`<line x1=${e} y1=${o} x2=${e + n} y2=${o}></line>`);
		return N`<g class="grid">${a}</g>`;
	}
	_renderZone(e) {
		let t = `${e.family} ${e.enabled ? "" : "disabled"} ${e === this._selected ? "selected" : ""}`;
		return e.closed ? e.points.length >= 3 ? N`<polygon class="zone ${t}" points=${$(e.points)}></polygon>` : F : e.points.length >= 2 ? N`<polyline class="line ${t}" points=${$(e.points)}></polyline>` : F;
	}
	_renderDocks() {
		return (this._map?.docks ?? []).map((e) => {
			let t = e.straight_phi ?? 0, { dock: n, guard: r } = We(e.point, t);
			return N`<polygon class="guard" points=${$(r)}></polygon>
        <polygon class="dock" points=${$(n)}></polygon>`;
		});
	}
	_renderFeedback(e) {
		let t = [], n = ze(this._feedback.plan_feedback);
		for (let e of n.remaining) t.push(N`<polyline class="plan-remaining" points=${$(e)}></polyline>`);
		for (let e of n.visited) t.push(N`<polyline class="plan-visited" points=${$(e)}></polyline>`);
		let r = Be(this._feedback.recharge_feedback);
		r.length >= 2 && t.push(N`<polyline class="route" points=${$(r)}></polyline>`);
		let i = G(this._feedback.obstacles);
		for (let n of i.detections) {
			let [r, i] = n.point, a = Math.max(.35, 7 * e), o = n === this._selectedObstacle;
			t.push(N`<rect class="detection ${o ? "selected" : ""}" x=${-r - a / 2} y=${-i - a / 2} width=${a} height=${a}
          transform="rotate(45 ${-r} ${-i})"></rect>`);
		}
		for (let n of i.barriers) {
			let r = n.reduce((e, t) => e + t[0], 0) / n.length, i = n.reduce((e, t) => e + t[1], 0) / n.length, a = Math.max(...n.map((e) => Math.hypot(e[0] - r, e[1] - i)));
			t.push(N`<circle class="obstacle-ring" cx=${-r} cy=${-i} r=${Math.max(a + .25, 7 * e)}></circle>`), n.length >= 2 ? t.push(N`<polyline class="obstacle" points=${$(n)}></polyline>`) : t.push(N`<circle class="obstacle-dot" cx=${-r} cy=${-i} r=${Math.max(.08, 2.5 * e)}></circle>`);
		}
		return t;
	}
	_renderTrail() {
		return this._config?.trail === !1 ? F : $e(this._trail).map((e) => {
			let t = `trail ${e.reverse ? "reverse" : ""} ${e.working ? "" : "thin"}`;
			return e.working ? N`<polyline class=${t} stroke-width=${ft} points=${$(e.points)}></polyline>` : N`<polyline class=${t} points=${$(e.points)}></polyline>`;
		});
	}
	_renderRobot(e) {
		let t = this._live;
		if (!t || t.x === null || t.y === null || t.phi === null) return F;
		let n = Ge(t.x, t.y, t.phi), [r, i] = K(t.x, t.y);
		return N`${1.3 / e < 22 ? N`<circle class="robot-halo ${q(t) ? "fault" : ""}" cx=${r} cy=${i} r=${11 * e}></circle>` : F}
      <polygon class="robot ${q(t) ? "fault" : t.awake === !1 ? "asleep" : ""}" points=${$(n)}></polygon>`;
	}
	_renderLabels(e) {
		let t = 13 * e;
		return (this._map?.zones ?? []).filter((e) => e.closed && e.name && e.points.length >= 3).map((e) => {
			let n = e.points.reduce((e, t) => e + t[0], 0) / e.points.length, r = e.points.reduce((e, t) => e + t[1], 0) / e.points.length;
			return N`<text class="label" x=${-n} y=${-r} font-size=${t} stroke-width=${t * .28}>${e.name}</text>`;
		});
	}
	_renderPicks(e) {
		let t = this._align;
		if (!t?.placement) return F;
		let n = 6 * e, r = t.step === "preview" && t.result ? t.result : t.placement, i = [t.u1, t.u2].filter((e) => !!e).map((e) => qe(r, e)), a = [t.w1, t.w2].filter((e) => !!e);
		return N`${[...i, ...a].map(([e, t]) => N`<circle class="pick" cx=${e} cy=${t} r=${n}></circle>`)}`;
	}
	_renderFurniture() {
		let e = this._view, t = Z(e, this._size), n = et(e.width);
		return M`<div class="scale">
        ${n} m
        <div class="bar" style="width:${n / t}px"></div>
      </div>
      <div class="north" aria-hidden="true"><svg viewBox="0 0 14 16"><path d="M7 0 L14 16 L7 12 L0 16 Z"></path></svg>N</div>`;
	}
	_renderControls() {
		let e = !!this.hass?.user?.is_admin;
		return M`<div class="controls">
      <button class="icon-button" title="Fit the map" aria-label="Fit the map" @click=${() => this._fit()}>
        ${Q(Me)}
      </button>
      <button
        class="icon-button ${this._follow ? "active" : ""}"
        title="Follow the robot"
        aria-label="Follow the robot"
        aria-pressed=${this._follow ? "true" : "false"}
        @click=${() => this._toggleFollow()}
      >
        ${Q(Ae)}
      </button>
      ${this._config?.trail === !1 ? F : M`<button class="icon-button" title="Clear the trail" aria-label="Clear the trail" @click=${() => this._trail = []}>
            ${Q(je)}
          </button>`}
      ${e ? M`<button
            class="icon-button ${this._align ? "active" : ""}"
            title="Align an aerial photo"
            aria-label="Align an aerial photo"
            @click=${() => this._align ? this._align = void 0 : this._startAlign()}
          >
            ${Q(Ne)}
          </button>` : F}
    </div>`;
	}
	_obstacleCount() {
		let e = G(this._feedback.obstacles);
		return e.detections.length + e.barriers.length;
	}
	_obstacleTitle() {
		let e = G(this._feedback.obstacles), t = e.active ? "this run" : "the last run";
		return `${e.detections.length} ultrasonic and ${e.barriers.length} mapped obstacles in ${t}${e.planName ? ` (${e.planName})` : ""}`;
	}
	_renderInfo() {
		let e = this._selectedObstacle;
		if (e && !this._align) {
			let t = {
				ultrasonic_left: "Front-left ultrasonic",
				ultrasonic_middle: "Middle ultrasonic",
				ultrasonic_right: "Front-right ultrasonic"
			}, n = e.t ? (/* @__PURE__ */ new Date(e.t * 1e3)).toLocaleTimeString([], {
				hour: "2-digit",
				minute: "2-digit"
			}) : "";
			return M`<div class="info">
        <div><strong>Obstacle</strong></div>
        <div class="muted">
          ${t[e.source] ?? e.source}${e.distance_m == null ? F : M` · closest ${e.distance_m} m`}${n ? M` · ${n}` : F}${e.count > 1 ? M` · ${e.count} passes` : F}
        </div>
        <div class="muted">Position estimated from the robot and sensor direction</div>
      </div>`;
		}
		let t = this._selected;
		if (!t || this._align) return F;
		let n = {
			areas: "Work area",
			nogozones: "No-go zone",
			novisionzones: "No-vision zone",
			elec_fence: "Electronic fence",
			pathways: "Pathway",
			sidewalks: "Memory path",
			deadends: "Dead end"
		}, r = t.closed && t.area_m2 != null ? `${t.area_m2} m²` : `${t.length_m} m long`;
		return M`<div class="info">
      <div><strong>${t.name || "Unnamed"}</strong></div>
      <div class="muted">${n[t.family] ?? t.family} · ${r}${t.enabled ? "" : " · disabled"}</div>
    </div>`;
	}
	_renderAlignPanel() {
		let e = this._align;
		if (!e) return F;
		let [t, n] = {
			url: ["Aerial photo", "A top-down photo of your property served by Home Assistant, for example /local/yarbo/aerial.jpg for /config/www/yarbo/aerial.jpg. The card never fetches map tiles."],
			photo1: ["Step 1 of 4", "Tap a landmark on the photo, such as a corner of the driveway."],
			map1: ["Step 2 of 4", "Tap the same landmark on the map. Taps snap to zone corners and the dock."],
			photo2: ["Step 3 of 4", "Tap a second landmark on the photo, far from the first."],
			map2: ["Step 4 of 4", "Tap that second landmark on the map."],
			preview: ["Check the fit", "The photo is placed. Adjust the opacity, then save for everyone who uses this dashboard."]
		}[e.step];
		return M`<div class="panel" role="dialog" aria-label="Align an aerial photo">
      <div class="step">${t}</div>
      <div class="hint">${n}</div>
      ${e.step === "url" ? M`<div class="row">
            <input
              type="text"
              .value=${e.url}
              aria-label="Photo URL"
              @input=${(t) => this._align = {
			...e,
			url: t.target.value
		}}
            />
            <button class="primary" ?disabled=${e.busy} @click=${() => this._loadAlignImage()}>Load photo</button>
          </div>` : F}
      ${e.step === "preview" ? M`<div class="row">
            <label for="opacity">Opacity</label>
            <input
              id="opacity"
              type="range"
              min="0.2"
              max="1"
              step="0.05"
              .value=${String(e.opacity)}
              @input=${(t) => this._align = {
			...e,
			opacity: Number(t.target.value)
		}}
            />
          </div>` : F}
      ${e.error ? M`<div class="error">${e.error}</div>` : F}
      <div class="row">
        ${e.step === "preview" ? M`<button class="primary" ?disabled=${e.busy} @click=${() => this._saveAlign()}>Save</button>
              <button @click=${() => this._align = {
			...e,
			step: "photo1",
			u1: void 0,
			w1: void 0,
			u2: void 0,
			w2: void 0,
			result: void 0
		}}>
                Pick again
              </button>` : F}
        ${this._background ? M`<button @click=${() => this._clearBackground()}>Remove photo</button>` : F}
        <button @click=${() => this._align = void 0}>Cancel</button>
      </div>
    </div>`;
	}
};
customElements.get("yarbo-local-card-view") || customElements.define("yarbo-local-card-view", ht);
//#endregion
export { ht as YarboLocalCard };
