var MirageCore = (function(exports) {
	Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
	//#region lib/detector/canonical.ts
	/** Removed entirely: zero-width characters, soft hyphen, word joiner, BOM. */
	var DROPPED = /* @__PURE__ */ new Set([
		173,
		6158,
		8203,
		8204,
		8205,
		8288,
		65279
	]);
	/** Read as an ordinary space. */
	var SPACES = /* @__PURE__ */ new Set([
		160,
		5760,
		8199,
		8239,
		8287,
		12288
	]);
	var isSpace = (cp) => SPACES.has(cp) || cp >= 8192 && cp <= 8202;
	/** Read as '-': hyphens, dashes and minus signs. */
	var isDash = (cp) => cp >= 8208 && cp <= 8213 || cp === 8722 || cp === 65112 || cp === 65123;
	/** The code point of '0' in each decimal digit block MIRAGE reads (Unicode Nd). */
	var DIGIT_ZEROS = [
		1632,
		1776,
		2406,
		2534,
		2662,
		2790,
		2918,
		3046,
		3174,
		3302,
		3430,
		65296,
		120782,
		120792,
		120802,
		120812,
		120822
	];
	/** Letters from other scripts that are drawn exactly like Latin letters. */
	var CONFUSABLES = {};
	var addConfusables = (from, to) => {
		[...from].forEach((ch, i) => CONFUSABLES[ch.codePointAt(0)] = to[i]);
	};
	addConfusables("АВЕКМНОРСТХУаеорсухіјѕ", "ABEKMHOPCTXYaeopcyxijs");
	addConfusables("ΑΒΕΖΗΙΚΜΝΟΡΤΥΧο", "ABEZHIKMNOPTYXo");
	function mapCodePoint(cp) {
		if (cp < 128) return null;
		if (DROPPED.has(cp)) return "";
		if (isSpace(cp)) return " ";
		if (isDash(cp)) return "-";
		for (const zero of DIGIT_ZEROS) if (cp >= zero && cp <= zero + 9) return String(cp - zero);
		if (cp >= 65281 && cp <= 65374) return String.fromCharCode(cp - 65248);
		return CONFUSABLES[cp] ?? null;
	}
	function canonicalize(input) {
		if (!/[^\x00-\x7f]/.test(input)) return {
			text: input,
			changed: false,
			toOriginal: (start, end) => ({
				start,
				end
			})
		};
		let text = "";
		const srcStart = [];
		const srcEnd = [];
		let changed = false;
		for (let i = 0; i < input.length;) {
			const cp = input.codePointAt(i);
			const width = cp > 65535 ? 2 : 1;
			const mapped = mapCodePoint(cp);
			const out = mapped ?? input.slice(i, i + width);
			if (mapped !== null) changed = true;
			for (let k = 0; k < out.length; k++) {
				srcStart.push(i);
				srcEnd.push(i + width);
			}
			text += out;
			i += width;
		}
		return {
			text,
			changed,
			toOriginal(start, end) {
				if (start >= end) {
					const at = start < srcStart.length ? srcStart[start] : input.length;
					return {
						start: at,
						end: at
					};
				}
				return {
					start: srcStart[start],
					end: srcEnd[end - 1]
				};
			}
		};
	}
	/** The canonical text only (for comparing values, e.g. safe words and placeholders). */
	var canonicalText = (value) => canonicalize(value).text;
	var BEFORE = 40;
	var AFTER = 20;
	/** Words that confirm what a value is. */
	var CONFIRMS = {
		PHONE: /\b(phone|mobile|mob|cell|call|contact|whatsapp|number|ph)\b/i,
		EMAIL: /\b(e-?mail|mail|contact)\b/i,
		AADHAAR: /\b(aadhaar|aadhar|adhar|uid|uidai)\b/i,
		PAN: /\b(pan)\b/i,
		UPI: /\b(upi|vpa|gpay|google pay|phonepe|paytm|bhim|pay)\b/i,
		IFSC: /\b(ifsc)\b/i,
		IP_ADDRESS: /\b(ip|server|host|ssh|vpn|address)\b/i,
		CARD: /\b(card|credit|debit|visa|mastercard|rupay|amex|cvv)\b/i,
		API_KEY: /\b(key|token|secret|api|auth|bearer|credential)\b/i
	};
	/** Words that say the value is not real. */
	var EXAMPLE_WORDS = /\b(example|sample|dummy|fake|placeholder|lorem|e\.g\.)\b/i;
	/** Values that are masked already or obviously made up: XXXXX1234X, ••••, 00000 00000. */
	var PLACEHOLDER_VALUE = /[Xx*•]{3,}|(\d)\1{7,}/;
	function scoreContext(text, type, start, end, base, value) {
		const around = text.slice(Math.max(0, start - BEFORE), start) + " " + text.slice(end, end + AFTER);
		let confidence = base;
		let context;
		const confirm = CONFIRMS[type]?.exec(around);
		if (confirm) {
			confidence = Math.min(.99, confidence + .05);
			context = confirm[1].toLowerCase();
		}
		const example = EXAMPLE_WORDS.test(around) || /EXAMPLE/i.test(value);
		if (example) confidence -= type === "NAME" ? .35 : .25;
		if (PLACEHOLDER_VALUE.test(value)) confidence -= .5;
		return {
			confidence: Math.max(.05, Math.round(confidence * 100) / 100),
			context,
			example
		};
	}
	//#endregion
	//#region lib/detector/luhn.ts
	/** True when the digit string passes the Luhn check. Non-digits make it false. */
	function isValidLuhn(value) {
		if (!/^\d{2,}$/.test(value)) return false;
		let sum = 0;
		let double = false;
		for (let i = value.length - 1; i >= 0; i--) {
			let digit = value.charCodeAt(i) - 48;
			if (double) {
				digit *= 2;
				if (digit > 9) digit -= 9;
			}
			sum += digit;
			double = !double;
		}
		return sum % 10 === 0;
	}
	//#endregion
	//#region lib/detector/verhoeff.ts
	var D = [
		[
			0,
			1,
			2,
			3,
			4,
			5,
			6,
			7,
			8,
			9
		],
		[
			1,
			2,
			3,
			4,
			0,
			6,
			7,
			8,
			9,
			5
		],
		[
			2,
			3,
			4,
			0,
			1,
			7,
			8,
			9,
			5,
			6
		],
		[
			3,
			4,
			0,
			1,
			2,
			8,
			9,
			5,
			6,
			7
		],
		[
			4,
			0,
			1,
			2,
			3,
			9,
			5,
			6,
			7,
			8
		],
		[
			5,
			9,
			8,
			7,
			6,
			0,
			4,
			3,
			2,
			1
		],
		[
			6,
			5,
			9,
			8,
			7,
			1,
			0,
			4,
			3,
			2
		],
		[
			7,
			6,
			5,
			9,
			8,
			2,
			1,
			0,
			4,
			3
		],
		[
			8,
			7,
			6,
			5,
			9,
			3,
			2,
			1,
			0,
			4
		],
		[
			9,
			8,
			7,
			6,
			5,
			4,
			3,
			2,
			1,
			0
		]
	];
	var P = [
		[
			0,
			1,
			2,
			3,
			4,
			5,
			6,
			7,
			8,
			9
		],
		[
			1,
			5,
			7,
			6,
			2,
			8,
			3,
			0,
			9,
			4
		],
		[
			5,
			8,
			0,
			3,
			7,
			9,
			6,
			1,
			4,
			2
		],
		[
			8,
			9,
			1,
			6,
			0,
			4,
			3,
			5,
			2,
			7
		],
		[
			9,
			4,
			5,
			3,
			1,
			2,
			6,
			8,
			7,
			0
		],
		[
			4,
			2,
			8,
			6,
			5,
			7,
			3,
			9,
			0,
			1
		],
		[
			2,
			7,
			9,
			3,
			8,
			0,
			6,
			4,
			1,
			5
		],
		[
			7,
			0,
			4,
			6,
			9,
			1,
			3,
			2,
			5,
			8
		]
	];
	function digitsOf(value) {
		if (!/^\d+$/.test(value)) return null;
		return [...value].map(Number);
	}
	/** Runs the Verhoeff checksum over `digits`, offset by `shift` positions. */
	function checksum(digits, shift) {
		let c = 0;
		[...digits].reverse().forEach((digit, i) => {
			c = D[c][P[(i + shift) % 8][digit]];
		});
		return c;
	}
	/** True when the whole digit string (check digit last) passes Verhoeff. */
	function isValidVerhoeff(value) {
		const digits = digitsOf(value);
		if (!digits || digits.length < 2) return false;
		return checksum(digits, 0) === 0;
	}
	//#endregion
	//#region lib/detector/rules.ts
	/** Collects every match of a global regex, using capture group `group` as the value when given. */
	function matchAll(text, regex, group = 0) {
		const out = [];
		for (const m of text.matchAll(regex)) {
			const value = m[group];
			if (value === void 0 || m.index === void 0) continue;
			const offset = group === 0 ? 0 : m[0].indexOf(value);
			const start = m.index + offset;
			out.push({
				start,
				end: start + value.length,
				value
			});
		}
		return out;
	}
	var digitsOnly = (value) => value.replace(/\D/g, "");
	/** True when `pattern` occurs in the `before` characters ahead of `start` (context words). */
	function precededBy(text, start, pattern, before = 30) {
		return pattern.test(text.slice(Math.max(0, start - before), start));
	}
	/** 12 digits, optionally grouped 4-4-4, never starting with 0 or 1, passing Verhoeff. */
	var aadhaarRule = {
		type: "AADHAAR",
		policy: "mask",
		confidence: .95,
		reason: "checksum",
		find: (text) => matchAll(text, /(?<![\w-])[2-9]\d{3}([ -]?)\d{4}\1\d{4}(?![\w]|-\w)/g).filter((m) => isValidVerhoeff(digitsOnly(m.value)))
	};
	/** The 4th character of a PAN says who holds it (P person, C company, H HUF, F firm, …). */
	var PAN_HOLDER = /^[A-Z]{3}[PCHFATBLJG]/;
	/**
	* 5 letters, 4 digits, 1 letter, e.g. ABCDE1234F. Upper case anywhere, as PANs are written;
	* lower or mixed case only right after the word "PAN" ("my pan is abcde1234f").
	*/
	var panRule = {
		type: "PAN",
		policy: "mask",
		confidence: .9,
		reason: "pattern",
		find: (text) => [...matchAll(text, /(?<![\w])[A-Z]{5}\d{4}[A-Z](?![\w])/g).map((m) => ({
			...m,
			confidence: PAN_HOLDER.test(m.value) ? .92 : .8
		})), ...matchAll(text, /(?<![\w])[A-Za-z]{5}\d{4}[A-Za-z](?![\w])/g).filter((m) => m.value !== m.value.toUpperCase() && precededBy(text, m.start, /\bpan\b[^.\n]*$/i)).map((m) => ({
			...m,
			confidence: .85,
			reason: "context"
		}))]
	};
	/** 10 digits starting 6-9, grouped 5-5, 3-3-4 or not at all, with optional +91, 91 or 0 prefix. */
	var phoneRule = {
		type: "PHONE",
		policy: "mask",
		confidence: .85,
		reason: "pattern",
		find: (text) => [...matchAll(text, /(?<![\w+])(?:(?:\+|00)?91[ -]?|0)?(?:[6-9]\d{4}[ -]?\d{5}|[6-9]\d{2}[ -]\d{3}[ -]\d{4})(?![\w])/g), ...matchAll(text, /(?<![\w+])(?:\+?91[ .-]?)?[6-9](?:[ .-]?\d){9}(?![\w]|[ .-]\d)/g).filter((m) => /[ .-]\d[ .-]\d/.test(m.value) && precededBy(text, m.start, /\b(?:phone|mobile|number|call|whatsapp|contact|ph)\b[^.\n]*$/i)).map((m) => ({
			...m,
			confidence: .8,
			reason: "context"
		}))]
	};
	/** Standard email: local part, @, domain with at least one dot. */
	var emailRule = {
		type: "EMAIL",
		policy: "mask",
		confidence: .99,
		reason: "pattern",
		find: (text) => [...matchAll(text, /(?<![\w.%+-])[A-Za-z0-9](?:[A-Za-z0-9._%+-]*[A-Za-z0-9_%+-])?@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}(?![\w-])/g), ...matchAll(text, /(?<![\w.])[A-Za-z0-9][A-Za-z0-9._%+-]*\s*[[({]\s*at\s*[\])}]\s*[A-Za-z0-9-]+(?:\s*[[({]\s*dot\s*[\])}]\s*[A-Za-z0-9-]+)+(?![\w])/gi).map((m) => ({
			...m,
			confidence: .85
		}))]
	};
	/** Handles after @ that are common in code and never real UPI handles (npm tags, branches). */
	var NOT_UPI_HANDLES = /* @__PURE__ */ new Set([
		"latest",
		"next",
		"beta",
		"alpha",
		"canary",
		"rc",
		"stable",
		"dev",
		"main",
		"master",
		"head",
		"localhost",
		"types",
		"version",
		"legacy",
		"experimental",
		"nightly",
		"lts",
		"server",
		"host",
		"github",
		"gitlab",
		"bitbucket",
		"heroku",
		"docker",
		"remote",
		"example"
	]);
	/** Handles of real UPI apps and banks: a match on one of these is almost certainly a UPI ID. */
	var KNOWN_UPI_HANDLES = /* @__PURE__ */ new Set([
		"okaxis",
		"oksbi",
		"okhdfcbank",
		"okicici",
		"ybl",
		"ibl",
		"axl",
		"paytm",
		"ptyes",
		"ptaxis",
		"pthdfc",
		"ptsbi",
		"upi",
		"apl",
		"yapl",
		"rapl",
		"fbl",
		"icici",
		"sbi",
		"hdfcbank",
		"axisbank",
		"axisb",
		"kotak",
		"kmbl",
		"pnb",
		"boi",
		"barodampay",
		"unionbank",
		"uboi",
		"idbi",
		"rbl",
		"federal",
		"indus",
		"yesbank",
		"jio",
		"airtel",
		"freecharge",
		"ikwik",
		"waicici",
		"wahdfcbank",
		"wasbi",
		"waaxis",
		"abfspay",
		"jupiteraxis",
		"sliceaxis",
		"naviaxis",
		"superyes",
		"hsbc",
		"citi",
		"dbs",
		"sc",
		"cnrb",
		"mahb",
		"indianbank",
		"iob",
		"ucobank",
		"kvb",
		"kbl",
		"equitas",
		"aubank",
		"dlb",
		"csbpay",
		"timecosmos",
		"pingpay",
		"postbank"
	]);
	/** name@handle with no dot after the @, which tells it apart from an email. */
	var upiRule = {
		type: "UPI",
		policy: "mask",
		confidence: .7,
		reason: "pattern",
		find: (text) => matchAll(text, /(?<![\w.%+-])[A-Za-z0-9][A-Za-z0-9._-]{1,255}@([A-Za-z][A-Za-z0-9]{1,63})(?![\w-])(?!\.[A-Za-z0-9])/g).filter((m) => !NOT_UPI_HANDLES.has(m.value.slice(m.value.indexOf("@") + 1).toLowerCase())).map((m) => KNOWN_UPI_HANDLES.has(m.value.slice(m.value.indexOf("@") + 1).toLowerCase()) ? {
			...m,
			confidence: .95
		} : m)
	};
	/** 4 letters, a 0, then 6 letters or digits, e.g. SBIN0001234. */
	var ifscRule = {
		type: "IFSC",
		policy: "mask",
		confidence: .85,
		reason: "pattern",
		find: (text) => matchAll(text, /(?<![\w])[A-Z]{4}0[A-Z0-9]{6}(?![\w])/g)
	};
	/** 13-19 digits (plain, 4-4-4-4 style, or Amex 4-6-5) with a card-like first digit, passing Luhn. */
	var cardRule = {
		type: "CARD",
		policy: "block",
		confidence: .95,
		reason: "checksum",
		find: (text) => {
			return [
				/(?<![\w])[2-68]\d{12,18}(?![\w])/g,
				/(?<![\w])[2-68]\d{3}([ -])\d{4}\1\d{4}\1\d{1,4}(?:\1\d{1,3})?(?![\w])/g,
				/(?<![\w])3\d{3}([ -])\d{6}\1\d{5}(?![\w])/g
			].flatMap((p) => matchAll(text, p)).filter((m) => {
				const digits = digitsOnly(m.value);
				if (precededBy(text, m.start, /\b(?:a\/c|acct|account)\b[^.\n]{0,20}$/i)) return false;
				return digits.length >= 13 && digits.length <= 19 && isValidLuhn(digits);
			});
		}
	};
	/** Known key formats. Kept specific so ordinary code and hashes are not blocked. */
	var KNOWN_KEY_PATTERNS = [
		[/(?<![\w-])sk-ant-[A-Za-z0-9_-]{20,}(?![\w-])/g, "anthropic"],
		[/(?<![\w-])sk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}(?![\w-])/g, "openai"],
		[/(?<![\w])(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}(?![\w])/g, "stripe"],
		[/(?<![\w])(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}(?![\w])/g, "aws_access_key"],
		[/(?<![\w])(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}(?![\w])/g, "github"],
		[/(?<![\w])github_pat_[A-Za-z0-9_]{40,}(?![\w])/g, "github"],
		[/(?<![\w])glpat-[A-Za-z0-9_-]{20,}(?![\w-])/g, "gitlab"],
		[/(?<![\w])AIza[0-9A-Za-z_-]{35}(?![\w-])/g, "google"],
		[/(?<![\w])GOCSPX-[A-Za-z0-9_-]{24,}(?![\w-])/g, "google_oauth"],
		[/(?<![\w])xox[abprse]-[A-Za-z0-9-]{10,}(?![\w])/g, "slack"],
		[/(?<![\w])xapp-\d-[A-Za-z0-9-]{10,}(?![\w])/g, "slack"],
		[/https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9]+\/[A-Za-z0-9]+\/[A-Za-z0-9]{12,}/g, "webhook"],
		[/https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]{20,}/g, "webhook"],
		[/(?<![\w])npm_[A-Za-z0-9]{36}(?![\w])/g, "npm"],
		[/(?<![\w])hf_[A-Za-z0-9]{30,}(?![\w])/g, "huggingface"],
		[/(?<![\w])SG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{30,}(?![\w-])/g, "sendgrid"],
		[/(?<![\w])SK[0-9a-f]{32}(?![\w])/g, "twilio"],
		[/(?<![\w:])\d{8,10}:AA[A-Za-z0-9_-]{33}(?![\w-])/g, "telegram"],
		[/(?<![\w])eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?![\w])/g, "jwt"]
	];
	/** An AWS secret access key: 40 base64 characters, named as one nearby. */
	var AWS_SECRET = /(?<![A-Za-z0-9/+])[A-Za-z0-9/+]{40}(?![A-Za-z0-9/+=])/g;
	var AWS_SECRET_CONTEXT = /(?:aws_?secret|secret_?access_?key|secretaccesskey|aws.{0,20}secret|secret key)[^\n]{0,20}$/i;
	/** "Authorization: Bearer <token>" and friends. */
	var BEARER = /\b(?:Bearer|Token|Basic)\s+([A-Za-z0-9._~+/-]{20,}=*)(?![\w])/g;
	/** Shannon entropy in bits per character. */
	function entropy(value) {
		const counts = /* @__PURE__ */ new Map();
		for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
		let bits = 0;
		for (const n of counts.values()) {
			const p = n / value.length;
			bits -= p * Math.log2(p);
		}
		return bits;
	}
	/**
	* A long random-looking string: 32+ characters mixing upper case, lower case and digits,
	* with high entropy. Pure hex (hashes, UUIDs) and path-like or word-like strings are skipped.
	*/
	function isRandomLooking(value) {
		if (value.length < 32) return false;
		if (/^[0-9a-fA-F-]+$/.test(value)) return false;
		if (!/[A-Z]/.test(value) || !/[a-z]/.test(value) || !/\d/.test(value)) return false;
		if ((value.match(/\d/g)?.length ?? 0) < 4) return false;
		return entropy(value) >= 4.2;
	}
	var apiKeyRule = {
		type: "API_KEY",
		policy: "block",
		confidence: .98,
		reason: "knownFormat",
		find: (text) => {
			const known = KNOWN_KEY_PATTERNS.flatMap(([p, kind]) => matchAll(text, p).map((m) => ({
				...m,
				kind
			})));
			const hasAwsKeyId = known.some((k) => k.kind === "aws_access_key");
			for (const m of matchAll(text, AWS_SECRET)) {
				const named = precededBy(text, m.start, AWS_SECRET_CONTEXT, 60);
				if ((named || hasAwsKeyId) && /[A-Z]/.test(m.value) && /[a-z]/.test(m.value) && /\d|[/+]/.test(m.value)) known.push({
					...m,
					kind: "aws_secret_key",
					confidence: named ? .97 : .9,
					reason: "context"
				});
			}
			for (const m of matchAll(text, BEARER, 1)) if (!known.some((k) => m.start < k.end && k.start < m.end)) known.push({
				...m,
				kind: "bearer",
				confidence: .9,
				reason: "context"
			});
			const random = matchAll(text, /(?<![\w+/=-])[A-Za-z0-9_+/-]{32,}={0,2}(?![\w+/=-])/g).filter((m) => isRandomLooking(m.value) && !known.some((k) => m.start < k.end && k.start < m.end)).map((m) => ({
				...m,
				kind: "high_entropy",
				confidence: .7,
				reason: "entropy"
			}));
			return [...known, ...random];
		}
	};
	/** PEM and OpenSSH private keys, PGP private key blocks; also a pasted key missing its END line. */
	var privateKeyRule = {
		type: "PRIVATE_KEY",
		policy: "block",
		confidence: .99,
		reason: "knownFormat",
		find: (text) => {
			const begin = /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g;
			const out = [];
			for (const m of text.matchAll(begin)) {
				const start = m.index ?? 0;
				const rest = text.slice(start);
				const end = /-----END (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/.exec(rest);
				const length = end ? end.index + end[0].length : /^-----BEGIN[^\n]*(?:\n[A-Za-z0-9+/=:\- ]*)*/.exec(rest)?.[0].length ?? m[0].length;
				out.push({
					start,
					end: start + length,
					value: text.slice(start, start + length).trimEnd()
				});
			}
			return out.map((m) => ({
				...m,
				end: m.start + m.value.length
			}));
		}
	};
	/** Literal passwords that are documentation, not secrets: postgres://user:password@localhost. */
	var DOC_PASSWORDS = /* @__PURE__ */ new Set([
		"password",
		"pass",
		"passwd",
		"pwd",
		"secret",
		"changeme",
		"yourpassword",
		"mypassword"
	]);
	/**
	* The password inside a URL or connection string: postgres://admin:S3cret@db:5432/app.
	* Only the password is taken, so the AI still sees the user, host and database it may need.
	*/
	var connectionStringRule = {
		type: "PASSWORD",
		policy: "block",
		confidence: .95,
		reason: "pattern",
		find: (text) => {
			const url = /\b([a-z][a-z0-9+.-]{1,20}):\/\/[^\s:/@'"`]+:([^\s/@'"`]+)@[\w.-]/gi;
			const out = [];
			for (const m of text.matchAll(url)) {
				const scheme = m[1].toLowerCase();
				const password = m[2];
				if (m.index === void 0 || isPlaceholderValue(password) || DOC_PASSWORDS.has(password.toLowerCase())) continue;
				const start = m.index + m[0].lastIndexOf(`:${password}@`) + 1;
				const kind = /^(?:https?|ftps?|sftp|ssh|ws|wss)$/.test(scheme) ? "url_credentials" : "connection_string";
				out.push({
					start,
					end: start + password.length,
					value: password,
					kind
				});
			}
			return out;
		}
	};
	/** Names that say "this value is a secret" when something is assigned to them. */
	var SECRET_NAME = String.raw`(?:api[_-]?key|apikey|x-api-key|secret(?:[_-]?key)?|client[_-]?secret|app[_-]?secret|access[_-]?token|auth[_-]?token|refresh[_-]?token|id[_-]?token|bearer[_-]?token|token|private[_-]?key|secret[_-]?access[_-]?key|access[_-]?key|account[_-]?key|signing[_-]?key|encryption[_-]?key|master[_-]?key|webhook[_-]?secret|session[_-]?(?:key|secret|token)|credentials?)`;
	/** A value that looks like a real secret, not a variable, placeholder or ordinary word. */
	function looksLikeSecretValue(value) {
		if (value.length < 8 || isPlaceholderValue(value)) return false;
		if (/your|here|example|sample|dummy|changeme|redacted|xxxx|\.\.\./i.test(value)) return false;
		if (/^[A-Za-z_$][A-Za-z_$]*(?:\.[A-Za-z_$][A-Za-z_$]*)+$/.test(value)) return false;
		if (/^[A-Z][A-Z0-9_]+$/.test(value)) return false;
		if (/[()]/.test(value)) return false;
		if (/^[a-z]+(?:[-_ ][a-z]+)*$/.test(value)) return false;
		return /\d/.test(value) || /[^A-Za-z0-9]/.test(value) || /[a-z]/.test(value) && /[A-Z]/.test(value);
	}
	/**
	* A value assigned to a secret-looking name in code, .env files, JSON, YAML or query strings:
	* STRIPE_SECRET=…, "client_secret": "…", apiKey: '…', ?api_key=… . Password names are the
	* PASSWORD rule's job.
	*/
	var secretAssignmentRule = {
		type: "API_KEY",
		policy: "block",
		confidence: .88,
		reason: "assignment",
		find: (text) => {
			const assignment = new RegExp(String.raw`(?<![A-Za-z0-9])[A-Za-z0-9_.-]*?` + SECRET_NAME + String.raw`(?![A-Za-z0-9_])["']?\s*(?::=|=|:)\s*(?:(["'\x60])([^"'\x60\n]+?)\1|([^\s"'\x60,;&<>]+))`, "gi");
			const out = [];
			for (const m of text.matchAll(assignment)) {
				const raw = m[2] ?? m[3];
				if (!raw || m.index === void 0) continue;
				const value = m[2] ?? raw.replace(/[.,)\]}]+$/, "");
				if (!looksLikeSecretValue(value)) continue;
				const start = m.index + m[0].lastIndexOf(raw);
				out.push({
					start,
					end: start + value.length,
					value,
					kind: "env_secret"
				});
			}
			return out;
		}
	};
	/** Values that are clearly not a password: placeholders, env lookups, masks. */
	function isPlaceholderValue(value) {
		return /^(?:process\.env|os\.environ|env\.|import\.meta\.env|\$\{|\$[A-Z_]|<|\*{3,}|x{3,}|null|none|undefined|true|false)/i.test(value) || value.length < 3;
	}
	/** Looks like a chosen password: 6+ chars with a digit, a symbol, or mixed case. */
	function looksLikePassword(value) {
		if (value.length < 6) return false;
		return /\d/.test(value) || /[^A-Za-z0-9]/.test(value) || /[a-z]/.test(value) && /[A-Z]/.test(value);
	}
	/** The ID, contact and secret rules, in priority order for equal-length overlaps (OTP before password: "one-time password: 7351"). */
	var PATTERN_RULES = [
		cardRule,
		privateKeyRule,
		apiKeyRule,
		connectionStringRule,
		secretAssignmentRule,
		{
			type: "OTP",
			policy: "block",
			confidence: .9,
			reason: "context",
			find: (text) => {
				const out = [];
				const digitRuns = matchAll(text, /(?<![\w.,/-]|\d[ -])\d{4,8}(?![\w]|[.,/-]\d|[ -]\d)/g);
				const otpWords = matchAll(text, /(?<![A-Za-z])(?:otp|one[- ]time (?:password|passcode|code|pin))(?![A-Za-z])/gi);
				for (const run of digitRuns) if (otpWords.some((w) => run.start >= w.end && run.start - w.end <= 30 || w.start >= run.end && w.start - run.end <= 30)) out.push(run);
				out.push(...matchAll(text, /(?<!(?:zip|pin|postal|area|error|status|country|exit|return|isd|std|hsn|sac|promo|coupon|discount|source|qr|bar|dial)[ -]?)(?<![A-Za-z])(?:(?:verification|security|confirmation|login|auth|authentication|access|sign[- ]?in|2fa|mfa)\s+)?code\s*(?:is|was|:|=|-)?\s*(\d{4,8})(?![\w]|[.,/-]\d)/gi, 1));
				return out;
			}
		},
		{
			type: "PASSWORD",
			policy: "block",
			confidence: .9,
			reason: "context",
			find: (text) => {
				const keyword = String.raw`(?<![A-Za-z])(?:password|passwd|passphrase|passcode|pwd|pass)(?![A-Za-z])`;
				const withSeparator = new RegExp(keyword + String.raw`["']?\s*[:=]\s*(?:(["'\x60])([^"'\x60\s]+)\1|([^\s"'\x60,;]+))`, "gi");
				const withIs = new RegExp(keyword + String.raw`\s+(?:is|was)\s*[:\-]?\s*(["']?)([^\s"']+)\1`, "gi");
				const out = [];
				for (const m of text.matchAll(withSeparator)) {
					const quoted = m[2];
					const raw = quoted ?? m[3];
					if (!raw || m.index === void 0) continue;
					const value = quoted ?? raw.replace(/[.!?)]+$/, "");
					if (isPlaceholderValue(value)) continue;
					const start = m.index + m[0].lastIndexOf(raw);
					out.push({
						start,
						end: start + value.length,
						value
					});
				}
				for (const m of text.matchAll(withIs)) {
					const raw = m[2];
					if (!raw || m.index === void 0) continue;
					const value = raw.replace(/[.,;!?)]+$/, "");
					if (isPlaceholderValue(value) || !looksLikePassword(value)) continue;
					const start = m.index + m[0].lastIndexOf(raw);
					out.push({
						start,
						end: start + value.length,
						value
					});
				}
				const bare = new RegExp(keyword + String.raw`\s+(["']?)([^\s"']{8,})\1`, "gi");
				for (const m of text.matchAll(bare)) {
					const raw = m[2];
					if (!raw || m.index === void 0) continue;
					const value = raw.replace(/[.,;!?)]+$/, "");
					if (!(/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) || isPlaceholderValue(value) || out.some((o) => o.start <= m.index + m[0].length && m.index <= o.end)) continue;
					const start = m.index + m[0].lastIndexOf(raw);
					out.push({
						start,
						end: start + value.length,
						value
					});
				}
				return out;
			}
		},
		aadhaarRule,
		panRule,
		ifscRule,
		emailRule,
		upiRule,
		phoneRule
	];
	//#endregion
	//#region lib/detector/contextRules.ts
	/** 9-18 digit account number right after "account no", "A/c", "acct" and similar. */
	var bankAccountRule = {
		type: "BANK_ACCOUNT",
		policy: "mask",
		confidence: .9,
		reason: "context",
		find: (text) => matchAll(text, /(?<![A-Za-z])(?:a\/c|acct|account|savings account|current account)\.?\s*(?:no\.?|number|num|#)?\s*(?:is\s*)?[:#-]?\s*(\d(?:[ -]?\d){8,17})(?![\w]|[ -]\d)/gi, 1).filter((m) => !/^(\d)\1+$/.test(digitsOnly(m.value)))
	};
	var MONTH = String.raw`(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)`;
	var DATE = String.raw`(?:\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}(?:st|nd|rd|th)?\s+${MONTH},?\s+\d{4}|${MONTH}\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})`;
	/** A full date right after "DOB", "date of birth", "born on" or "birthday". */
	var dobRule = {
		type: "DOB",
		policy: "mask",
		confidence: .9,
		reason: "context",
		find: (text) => matchAll(text, new RegExp(String.raw`(?<![A-Za-z])(?:dob|d\.o\.b\.?|date\s+of\s+birth|born(?:\s+on)?|birth\s*date|birthday)\s*(?:is|was)?\s*[:=-]?\s*(${DATE})(?![\w])`, "gi"), 1)
	};
	var OCTET = String.raw`(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)`;
	/** IPv4 addresses. Loopback, 0.0.0.0, netmasks and version numbers are skipped. */
	var ipRule = {
		type: "IP_ADDRESS",
		policy: "mask",
		confidence: .8,
		reason: "pattern",
		find: (text) => matchAll(text, new RegExp(String.raw`(?<![\w.:-])(?:${OCTET}\.){3}${OCTET}(?![\w-]|\.\d)`, "g")).filter((m) => {
			if (/^(?:127\.|0\.0\.0\.0$|255\.)/.test(m.value)) return false;
			const before = text.slice(Math.max(0, m.start - 12), m.start);
			return !/(?:\bv|version\s*)$/i.test(before);
		})
	};
	/** Capitalized words that follow "I'm", "Dear", "Mr." and so on but are not names. */
	var NOT_NAMES = new Set("i the a an sir madam mam maam team all everyone there friend friends customer customers hiring manager indian american british hindu muslim christian sikh jain buddhist catholic english hindi tamil kannada telugu malayalam bengali marathi gujarati punjabi urdu not very so just also still really here back sure sorry fine good ok okay new happy glad trying looking using working writing going getting having planning currently unable confused stuck interested from in at on with for to and or but your my our this that monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december chatgpt gemini claude copilot perplexity ai bot siri alexa google python java javascript react world user admin support sales hr it ceo cto doctor professor student teacher hod principal dean officer director applicant candidate guest members colleagues folks guys ma am".split(" "));
	/** One to three capitalized words (Unicode letters), read at a fixed position (sticky). */
	var NAME_AT = /(\p{Lu}[\p{Ll}'’-]+(?:[ \t]+\p{Lu}[\p{Ll}'’-]+){0,2})/uy;
	var NAME_TRIGGERS = [
		{
			pattern: /\b(?:my name is|my name's|name\s*[:-]|named)\s*/gi,
			confidence: .9
		},
		{
			pattern: /\b(?:mr|mrs|ms|miss|dr|prof|shri|smt|sri|kumari)\.?\s+/gi,
			confidence: .85
		},
		{
			pattern: /\b(?:my|our)\s+(?:client|customer|patient|tenant|landlord|friend|colleague|manager|boss|son|daughter|wife|husband|father|mother|dad|mom|brother|sister|student|teacher|employee|neighbou?r|uncle|aunt|cousin)\s+(?:is\s+|named\s+)?/gi,
			confidence: .8
		},
		{
			pattern: /\b(?:i am|i'm|i’m)\s+/gi,
			confidence: .75,
			singleNeedsStop: true
		},
		{
			pattern: /\b(?:dear|hi|hello|hey)\s+/gi,
			confidence: .7,
			singleNeedsStop: true
		},
		{
			pattern: /\b(?:regards|thanks|thank you|sincerely|cheers|warmly),?\s*\n\s*/gi,
			confidence: .75
		}
	];
	/** Names from context: "my name is Priya Nair", "Dr. Rao", "I'm Ramesh Kumar", "my client Anita Rao". */
	var nameRule = {
		type: "NAME",
		policy: "mask",
		confidence: .75,
		reason: "context",
		find: (text) => {
			const out = [];
			for (const trigger of NAME_TRIGGERS) for (const t of text.matchAll(trigger.pattern)) {
				const at = (t.index ?? 0) + t[0].length;
				NAME_AT.lastIndex = at;
				const m = NAME_AT.exec(text);
				if (!m) continue;
				const words = m[1].split(/\s+/);
				const kept = [];
				for (const w of words) {
					if (NOT_NAMES.has(w.toLowerCase().replace(/['’]/g, ""))) break;
					kept.push(w);
				}
				if (kept.length === 0 || kept[0].length < 2) continue;
				const value = kept.join(" ").replace(/['’-]+$/, "");
				if (trigger.singleNeedsStop && kept.length === 1) {
					const next = text.slice(at + value.length, at + value.length + 8);
					if (value.length < 3 || !/^(?:\s*[,.!?;:)]|\s*$|\s+(?:and|from|here|aged|age)\b)/.test(next)) continue;
				}
				out.push({
					start: at,
					end: at + value.length,
					value,
					confidence: trigger.confidence
				});
			}
			return out;
		}
	};
	/**
	* Medical terms. These are kept in the prompt (the AI needs them to answer) but flagged: a lab
	* result next to a name or ID is health data about a known person, so the risk score rises and
	* the user is told why.
	*/
	var HEALTH_TERMS = new RegExp(String.raw`\b(?:HbA1c|A1c|blood sugar|fasting sugar|glucose level|cholesterol|triglycerides|blood pressure|thyroid|TSH|haemoglobin|hemoglobin|creatinine|platelets?|biopsy|diagnos(?:ed|is)|prescri(?:bed|ption)|HIV|hepatitis|tuberculosis|cancer|tumou?r|chemotherapy|diabet(?:es|ic)|hypertension|asthma|depression|anxiety disorder|bipolar|schizophrenia|pregnan(?:t|cy)|miscarriage|IVF|STD|STI|lab report|blood test|medical report|psychiatrist|antidepressants?|insulin|metformin|dialysis|epilepsy|PCOS|PCOD)\b`, "g");
	var healthRule = {
		type: "HEALTH",
		policy: "warn",
		confidence: .8,
		reason: "pattern",
		find: (text) => {
			const lower = new RegExp(HEALTH_TERMS.source.replace(/\|HIV\|/, "|").replace(/\|STD\|STI\|/, "|"), "gi");
			const seen = /* @__PURE__ */ new Set();
			const out = [];
			for (const m of [...matchAll(text, HEALTH_TERMS), ...matchAll(text, lower)]) {
				if (seen.has(m.start)) continue;
				seen.add(m.start);
				out.push(m);
			}
			return out.sort((a, b) => a.start - b.start);
		}
	};
	/**
	* Passport numbers (Indian format: one letter, 7 digits, e.g. K1234567), only next to the word
	* "passport": the shape alone is too common (order and ticket numbers).
	*/
	var passportRule = {
		type: "PASSPORT",
		policy: "mask",
		confidence: .9,
		reason: "context",
		find: (text) => matchAll(text, /(?<![A-Za-z0-9])([A-PR-WYa-pr-wy][1-9]\d\s?\d{4}[1-9])(?![A-Za-z0-9])/g, 1).filter((m) => /\bpassport\b[^\n]{0,25}$/i.test(text.slice(Math.max(0, m.start - 60), m.start)))
	};
	var ADDRESS_WORDS = String.raw`(?:road|rd|street|st|nagar|layout|cross|main|sector|colony|lane|marg|block|phase|stage|apartments?|apts?|flat|floor|house|villa|society|towers?|residency|enclave|extension|extn|avenue|ave|circle|halli|palya|puram|pet|gunta|chowk|bazaar|gali)`;
	var PIN = String.raw`[1-9]\d{2}\s?\d{3}`;
	/** Context rules, lowest priority: an ID or secret always wins an overlap with them. */
	var CONTEXT_RULES = [
		bankAccountRule,
		passportRule,
		{
			type: "ADDRESS",
			policy: "mask",
			confidence: .85,
			reason: "pattern",
			find: (text) => {
				const labelled = matchAll(text, new RegExp(String.raw`\b(?:(?:my|home|office|delivery|postal|permanent|current|billing|shipping)\s+)?address(?:\s+is)?\s*[:\-]?\s*([^\n]{6,160}?\b${PIN})(?!\d)`, "gi"), 1).map((m) => ({
					...m,
					confidence: .92,
					reason: "context"
				}));
				const street = matchAll(text, new RegExp(String.raw`(?<![\w])(?:#\s*)?(?:\d{1,4}[A-Za-z]?(?:[/-]\d{1,4})?,?\s+)?[^\n]{0,80}?\b${ADDRESS_WORDS}\b[^\n]{0,100}?\b${PIN}(?!\d)`, "gi")).map((m) => {
					const lead = /(?:#\s*)?\d/.exec(m.value) ?? /\b[A-Z]/.exec(m.value);
					const cut = lead ? lead.index : 0;
					return {
						start: m.start + cut,
						end: m.end,
						value: m.value.slice(cut)
					};
				}).filter((m) => m.value.includes(",") && m.value.length >= 15);
				return [...labelled, ...street.filter((s) => !labelled.some((l) => s.start < l.end && l.start < s.end))];
			}
		},
		dobRule,
		ipRule,
		nameRule,
		healthRule
	];
	//#endregion
	//#region lib/detector/normalize.ts
	function normalizeValue(type, value) {
		const v = canonicalText(value);
		switch (type) {
			case "AADHAAR":
			case "CARD":
			case "OTP":
			case "BANK_ACCOUNT": return v.replace(/\D/g, "");
			case "PHONE": return v.replace(/\D/g, "").slice(-10);
			case "PAN":
			case "IFSC":
			case "PASSPORT": return v.toUpperCase();
			case "EMAIL": return v.toLowerCase().replace(/\s*[[({]\s*at\s*[\])}]\s*/g, "@").replace(/\s*[[({]\s*dot\s*[\])}]\s*/g, ".");
			case "UPI":
			case "IP_ADDRESS": return v.toLowerCase();
			case "NAME":
			case "CUSTOM":
			case "DOB":
			case "ADDRESS":
			case "HEALTH":
			case "API_KEY":
			case "PRIVATE_KEY":
			case "PASSWORD": return v.trim().replace(/\s+/g, " ").toLowerCase();
		}
	}
	//#endregion
	//#region lib/detector/taxonomy.ts
	/**
	* How bad it is if this one item reaches the AI provider.
	* critical: grants access to an account or money on its own.
	* high:     a government or bank identifier; enables fraud or KYC abuse.
	* medium:   identifies or reaches a person (name, phone, UPI, date of birth, health context).
	* low:      useful to an attacker only in combination (email, IFSC, IP address).
	*/
	var SEVERITY = {
		API_KEY: "critical",
		PRIVATE_KEY: "critical",
		PASSWORD: "critical",
		CARD: "critical",
		OTP: "critical",
		AADHAAR: "high",
		PAN: "high",
		BANK_ACCOUNT: "high",
		PASSPORT: "high",
		ADDRESS: "medium",
		PHONE: "medium",
		UPI: "medium",
		NAME: "medium",
		CUSTOM: "medium",
		DOB: "medium",
		HEALTH: "medium",
		EMAIL: "low",
		IFSC: "low",
		IP_ADDRESS: "low"
	};
	var CATEGORY = {
		AADHAAR: "identity",
		PAN: "identity",
		DOB: "identity",
		NAME: "identity",
		CUSTOM: "identity",
		PASSPORT: "identity",
		ADDRESS: "location",
		PHONE: "contact",
		EMAIL: "contact",
		CARD: "financial",
		BANK_ACCOUNT: "financial",
		UPI: "financial",
		IFSC: "financial",
		PASSWORD: "credentials",
		OTP: "credentials",
		PRIVATE_KEY: "credentials",
		API_KEY: "apiKeys",
		IP_ADDRESS: "location",
		HEALTH: "health"
	};
	/**
	* Risk points for one item at full confidence (lib/risk.ts). Chosen so that one item of each
	* severity lands in the matching band on its own: critical ≥ 50, high 30-35, medium 10-15, low 5-10.
	*/
	var WEIGHT = {
		API_KEY: 60,
		PRIVATE_KEY: 60,
		PASSWORD: 55,
		CARD: 55,
		OTP: 50,
		AADHAAR: 35,
		PAN: 30,
		BANK_ACCOUNT: 30,
		PASSPORT: 30,
		ADDRESS: 15,
		DOB: 15,
		UPI: 15,
		PHONE: 12,
		NAME: 12,
		CUSTOM: 12,
		HEALTH: 10,
		EMAIL: 10,
		IP_ADDRESS: 8,
		IFSC: 5
	};
	/** Placeholder label for a removed secret, e.g. «AWS_SECRET_KEY_REMOVED». */
	var SECRET_LABEL = {
		CARD: "CARD",
		API_KEY: "API_KEY",
		PRIVATE_KEY: "PRIVATE_KEY",
		PASSWORD: "PASSWORD",
		OTP: "OTP"
	};
	var KIND_LABEL = {
		aws_access_key: "AWS_ACCESS_KEY",
		aws_secret_key: "AWS_SECRET_KEY",
		openai: "OPENAI_KEY",
		anthropic: "ANTHROPIC_KEY",
		github: "GITHUB_TOKEN",
		gitlab: "GITLAB_TOKEN",
		google: "GOOGLE_API_KEY",
		slack: "SLACK_TOKEN",
		stripe: "STRIPE_KEY",
		jwt: "JWT",
		bearer: "TOKEN",
		connection_string: "DB_PASSWORD",
		url_credentials: "PASSWORD",
		webhook: "WEBHOOK_URL"
	};
	//#endregion
	//#region lib/detector/detect.ts
	var EMPTY_SETTINGS = {
		safeWords: [],
		alwaysMask: []
	};
	/** Every rule, in priority order for equal-length overlaps. */
	var RULES = [...PATTERN_RULES, ...CONTEXT_RULES];
	var escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	/** Whole-word, case-insensitive matches of the user's Always mask terms. */
	function findCustomTerms(text, terms) {
		const out = [];
		for (const term of terms) {
			const trimmed = canonicalText(term).trim();
			if (!trimmed) continue;
			const pattern = escapeRegex(trimmed).replace(/\s+/g, "\\s+");
			for (const m of text.matchAll(new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, "giu"))) {
				if (m.index === void 0) continue;
				out.push({
					start: m.index,
					end: m.index + m[0].length,
					value: m[0]
				});
			}
		}
		return out;
	}
	var POLICY_RANK = {
		block: 0,
		mask: 1,
		warn: 2
	};
	/**
	* Keeps the strongest finding where findings overlap: secrets beat personal data
	* (a secret must never slip through as a placeholder), personal data beats warnings,
	* then longer beats shorter, then earlier rules beat later ones.
	*/
	function resolveOverlaps(candidates) {
		const ordered = [...candidates].sort((a, b) => POLICY_RANK[a.policy] - POLICY_RANK[b.policy] || b.end - b.start - (a.end - a.start) || a.rank - b.rank || a.start - b.start);
		const kept = [];
		for (const { rank: _rank, ...finding } of ordered) {
			if (kept.some((k) => finding.start < k.end && k.start < finding.end)) continue;
			kept.push(finding);
		}
		return kept.sort((a, b) => a.start - b.start);
	}
	var safeKey = (value) => canonicalText(value).trim().replace(/\s+/g, " ").toLowerCase();
	function detect(text, settings = EMPTY_SETTINGS) {
		if (!text) return [];
		const canon = canonicalize(text);
		const scan = canon.text;
		const enabled = (rule) => settings.categories?.[CATEGORY[rule.type]] !== false;
		const candidates = [];
		const add = (rule, m, rank) => {
			const base = m.confidence ?? rule.confidence;
			const scored = scoreContext(scan, rule.type, m.start, m.end, base, m.value);
			if (rule.policy !== "block" && scored.confidence < .5) return;
			const { start, end } = canon.toOriginal(m.start, m.end);
			candidates.push({
				type: rule.type,
				policy: rule.policy,
				category: CATEGORY[rule.type],
				severity: SEVERITY[rule.type],
				confidence: scored.confidence,
				reason: m.reason ?? rule.reason,
				...m.kind ? { kind: m.kind } : {},
				...scored.context ? { context: scored.context } : {},
				start,
				end,
				value: text.slice(start, end),
				rank
			});
		};
		const placeholders = [...scan.matchAll(/«[A-Z_]+(?:_\d+)?»/g)].map((m) => [m.index, m.index + m[0].length]);
		const onPlaceholder = (m) => placeholders.some(([s, e]) => m.start < e && s < m.end);
		RULES.forEach((rule, rank) => {
			if (!enabled(rule)) return;
			for (const m of rule.find(scan)) if (!onPlaceholder(m)) add(rule, m, rank);
		});
		const custom = {
			type: "CUSTOM",
			policy: "mask",
			confidence: .99,
			reason: "custom",
			find: () => []
		};
		for (const m of findCustomTerms(scan, settings.alwaysMask)) add(custom, m, -1);
		const safe = new Set(settings.safeWords.map(safeKey));
		return resolveOverlaps(candidates.filter((c) => c.policy === "block" || !(safe.has(safeKey(c.value)) || safe.has(normalizeValue(c.type, c.value).toLowerCase()))));
	}
	//#endregion
	//#region lib/detector/types.ts
	var SECRET_TYPES = [
		"CARD",
		"API_KEY",
		"PRIVATE_KEY",
		"PASSWORD",
		"OTP"
	];
	var MASK_TYPES = [
		"AADHAAR",
		"PAN",
		"PHONE",
		"EMAIL",
		"UPI",
		"IFSC",
		"BANK_ACCOUNT",
		"IP_ADDRESS",
		"DOB",
		"ADDRESS",
		"PASSPORT",
		"NAME",
		"CUSTOM"
	];
	function isSecretType(type) {
		return SECRET_TYPES.includes(type);
	}
	function isMaskType(type) {
		return MASK_TYPES.includes(type);
	}
	//#endregion
	//#region lib/risk.ts
	var IDENTIFYING = [
		"NAME",
		"CUSTOM",
		"AADHAAR",
		"PAN",
		"PASSPORT",
		"ADDRESS",
		"PHONE",
		"EMAIL",
		"DOB",
		"BANK_ACCOUNT",
		"UPI"
	];
	var GOVERNMENT_ID = [
		"AADHAAR",
		"PAN",
		"PASSPORT"
	];
	var CONTACT = ["PHONE", "EMAIL"];
	var SEVERITY_RANK = {
		low: 0,
		medium: 1,
		high: 2,
		critical: 3
	};
	var LEVEL_FLOOR = {
		high: 41,
		critical: 71
	};
	function levelFor(score) {
		if (score <= 0) return "safe";
		if (score < LEVEL_FLOOR.high) return "low";
		if (score < LEVEL_FLOOR.critical) return "high";
		return "critical";
	}
	function assessRisk(findings) {
		if (findings.length === 0) return {
			score: 0,
			level: "safe",
			lines: [],
			worst: null
		};
		const byType = /* @__PURE__ */ new Map();
		for (const f of findings) {
			const seen = byType.get(f.type) ?? /* @__PURE__ */ new Map();
			const key = normalizeValue(f.type, f.value);
			seen.set(key, Math.max(seen.get(key) ?? 0, f.confidence));
			byType.set(f.type, seen);
		}
		const lines = [];
		for (const [type, values] of byType) {
			const confidences = [...values.values()].sort((a, b) => b - a);
			const points = confidences.reduce((sum, c, i) => sum + WEIGHT[type] * c * (i === 0 ? 1 : .5), 0);
			lines.push({
				label: type,
				points: Math.round(points),
				count: confidences.length
			});
		}
		lines.sort((a, b) => b.points - a.points);
		const has = (types) => types.some((t) => byType.has(t));
		if (byType.has("HEALTH") && has(IDENTIFYING)) lines.push({
			label: "COMBO_HEALTH_IDENTITY",
			points: 15
		});
		if (has(GOVERNMENT_ID) && has(CONTACT)) lines.push({
			label: "COMBO_ID_CONTACT",
			points: 10
		});
		let score = Math.max(1, lines.reduce((sum, l) => sum + l.points, 0));
		const worst = findings.reduce((w, f) => SEVERITY_RANK[f.severity] > SEVERITY_RANK[w] ? f.severity : w, "low");
		const floor = worst === "critical" ? LEVEL_FLOOR.critical : worst === "high" ? LEVEL_FLOOR.high : 0;
		if (score < floor) {
			lines.push({
				label: worst === "critical" ? "FLOOR_CRITICAL" : "FLOOR_HIGH",
				points: floor - score
			});
			score = floor;
		}
		if (score > 100) {
			const over = score - 100;
			const top = lines[0];
			top.points -= over;
			score = 100;
		}
		return {
			score,
			level: levelFor(score),
			lines,
			worst
		};
	}
	//#endregion
	//#region lib/tokenizer.ts
	/** Placeholder label per type. Names from rules, AWS or the Always mask list all read as PERSON. */
	var LABELS = {
		AADHAAR: "AADHAAR",
		PAN: "PAN",
		PHONE: "PHONE",
		EMAIL: "EMAIL",
		UPI: "UPI",
		IFSC: "IFSC",
		BANK_ACCOUNT: "ACCOUNT",
		IP_ADDRESS: "IP",
		DOB: "DOB",
		ADDRESS: "ADDRESS",
		PASSPORT: "PASSPORT",
		NAME: "PERSON",
		CUSTOM: "PERSON"
	};
	/** The one place the placeholder format is defined. */
	function formatToken(label, n) {
		return `«${label}_${n}»`;
	}
	/**
	* What a removed secret becomes: a named placeholder like «AWS_SECRET_KEY_REMOVED», so the AI
	* still knows what kind of value was there. It carries no number and is never stored, so it can
	* never be put back into a reply (it does not match TOKEN_PATTERN).
	*/
	function removedPlaceholder(type, kind) {
		return `«${kind && KIND_LABEL[kind] || SECRET_LABEL[type]}_REMOVED»`;
	}
	/** Matches any numbered placeholder, e.g. «PAN_1» or «PERSON_12». */
	var TOKEN_PATTERN = /«([A-Z]+)_(\d+)»/g;
	var emptyTokenState = () => ({
		counters: {},
		entries: []
	});
	/**
	* Returns a placeholder for each requested value, reusing the existing one when the same
	* normalized value was seen before in this chat. Does not mutate `state`.
	*/
	function assignTokens(state, requests, now = Date.now()) {
		const counters = { ...state.counters };
		const entries = [...state.entries];
		const tokens = requests.map(({ type, value }) => {
			const label = LABELS[type];
			const normalized = normalizeValue(type, value);
			const existing = entries.find((e) => LABELS[e.type] === label && e.normalized === normalized);
			if (existing) return existing.token;
			const n = (counters[label] ?? 0) + 1;
			counters[label] = n;
			const token = formatToken(label, n);
			entries.push({
				token,
				type,
				value,
				normalized,
				firstSeen: now
			});
			return token;
		});
		return {
			state: {
				counters,
				entries
			},
			tokens
		};
	}
	/** Real values for the given placeholders; unknown placeholders are left out. */
	function lookupTokens(state, tokens) {
		const values = {};
		for (const token of tokens) {
			const entry = state.entries.find((e) => e.token === token);
			if (entry) values[token] = entry.value;
		}
		return values;
	}
	/** Replaces spans of `text`. Spans must not overlap. */
	function replaceSpans(text, replacements) {
		const ordered = [...replacements].sort((a, b) => b.start - a.start);
		let out = text;
		for (const r of ordered) out = out.slice(0, r.start) + r.text + out.slice(r.end);
		return out;
	}
	//#endregion
	//#region lib/core/api.ts
	var CORE_VERSION = "1.0.0";
	var DEFAULT_POLICY = {
		low: "warn",
		medium: "recommendMask",
		high: "protect",
		critical: "confirm"
	};
	var RANK = {
		warn: 0,
		recommendMask: 1,
		protect: 2,
		confirm: 3
	};
	/**
	* A value shown so the user can recognise it without it being revealed:
	* ████████1234 for IDs, keys and numbers; d*******@gmail.com for email.
	*/
	function redact(f) {
		const v = canonicalText(f.value).replace(/\s+/g, "");
		if (f.type === "EMAIL" && v.includes("@")) {
			const [user, domain] = [v.slice(0, v.indexOf("@")), v.slice(v.indexOf("@") + 1)];
			return `${user.charAt(0)}${"*".repeat(Math.max(3, Math.min(8, user.length - 1)))}@${domain}`;
		}
		if (f.type === "NAME" || f.type === "CUSTOM" || f.type === "HEALTH") return `${v.charAt(0)}${"*".repeat(Math.min(8, Math.max(3, v.length - 1)))}`;
		if (f.type === "PASSWORD" || f.type === "OTP" || v.length < 8) return "█".repeat(8);
		const tail = v.length >= 12 ? 4 : 2;
		return "█".repeat(Math.min(12, v.length - tail)) + v.slice(-tail);
	}
	function analyze(text, settings, policy = DEFAULT_POLICY) {
		const findings = detect(text, settings);
		let action = null;
		for (const f of findings) {
			if (f.policy === "warn") continue;
			const a = policy[f.severity];
			if (action === null || RANK[a] > RANK[action]) action = a;
		}
		return {
			findings: findings.map((f) => ({
				...f,
				redacted: redact(f)
			})),
			risk: assessRisk(findings),
			action
		};
	}
	/**
	* The protected prompt: personal data behind numbered placeholders («PAN_1»), secrets replaced
	* by named unnumbered ones («AWS_SECRET_KEY_REMOVED») that are never stored. `keep` lists
	* finding indexes the user chose to send as typed.
	*/
	function protect(text, settings, state, keep = []) {
		state ??= emptyTokenState();
		const findings = detect(text, settings);
		const kept = new Set(keep);
		const hide = findings.map((f, i) => ({
			f,
			i
		})).filter(({ f, i }) => isMaskType(f.type) && !kept.has(i));
		const { state: next, tokens } = assignTokens(state, hide.map(({ f }) => ({
			type: f.type,
			value: f.value
		})));
		const replacements = [];
		let removed = 0;
		findings.forEach((f, i) => {
			if (kept.has(i)) return;
			if (isSecretType(f.type)) {
				removed++;
				replacements.push({
					start: f.start,
					end: f.end,
					text: removedPlaceholder(f.type, f.kind)
				});
				return;
			}
			const h = hide.findIndex((x) => x.i === i);
			if (h >= 0) replacements.push({
				start: f.start,
				end: f.end,
				text: tokens[h]
			});
		});
		return {
			text: replaceSpans(text, replacements),
			state: next,
			hidden: hide.length,
			removed
		};
	}
	/**
	* What each finding would be sent as right now (same numbering as protect() would give), for
	* hover tooltips. Warnings (kept) get null. Saves nothing.
	*/
	function previewPlaceholders(text, settings, state) {
		const findings = detect(text, settings);
		const masks = findings.map((f, i) => ({
			f,
			i
		})).filter(({ f }) => isMaskType(f.type));
		const { tokens } = assignTokens(state ?? emptyTokenState(), masks.map(({ f }) => ({
			type: f.type,
			value: f.value
		})));
		return findings.map((f, i) => {
			if (isSecretType(f.type)) return removedPlaceholder(f.type, f.kind);
			const m = masks.findIndex((x) => x.i === i);
			return m >= 0 ? tokens[m] : null;
		});
	}
	/** Puts real values back for known placeholders; secrets were never stored and stay removed. */
	function restore(text, state) {
		const values = lookupTokens(state, [...new Set([...text.matchAll(TOKEN_PATTERN)].map((m) => m[0]))]);
		let restored = 0;
		return {
			text: text.replace(TOKEN_PATTERN, (t) => {
				const v = values[t];
				if (v === void 0) return t;
				restored++;
				return v;
			}),
			restored
		};
	}
	/** Reply check: secrets and high-severity IDs only, never values the user's own map restored. */
	function checkReply(text, settings, known = []) {
		const knownSet = new Set(known.map((k) => canonicalText(k).replace(/[\s-]/g, "").toUpperCase()));
		const findings = analyze(text, settings).findings.filter((f) => (f.severity === "critical" || f.severity === "high") && !knownSet.has(canonicalText(f.value).replace(/[\s-]/g, "").toUpperCase()));
		return {
			findings,
			risk: assessRisk(findings),
			action: findings.length ? "warn" : null
		};
	}
	//#endregion
	exports.CATEGORY = CATEGORY;
	exports.CORE_VERSION = CORE_VERSION;
	exports.DEFAULT_POLICY = DEFAULT_POLICY;
	exports.SEVERITY = SEVERITY;
	exports.analyze = analyze;
	exports.checkReply = checkReply;
	exports.emptyTokenState = emptyTokenState;
	exports.previewPlaceholders = previewPlaceholders;
	exports.protect = protect;
	exports.redact = redact;
	exports.restore = restore;
	return exports;
})({});
