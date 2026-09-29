// Evaluation corpus for the detector (npm run eval; docs/detection.md, Results).
// Every value is fictional. Aadhaar numbers get a valid Verhoeff digit, cards are published test
// numbers or Luhn-valid made-up numbers, and key-shaped strings are assembled at runtime so the
// repo never holds a string in a real key format.
//
// Each case lists what MUST be found. Scoring (lib/detector/eval.test.ts) counts an expected item
// as found when a finding overlaps it with the right action (hide vs. remove); any other finding
// that hides or removes something is a false positive. Health warnings never count either way.

import { verhoeffCheckDigit } from '../lib/detector/verhoeff';

export type Group = 'pii' | 'secret' | 'clean' | 'adversarial' | 'obfuscated';
export interface Expect {
  value: string;
  action: 'mask' | 'block';
}
export interface Case {
  id: string;
  group: Group;
  text: string;
  expect: Expect[];
}

const aadhaar = (first11: string, sep = ' ') => {
  const d = first11 + String(verhoeffCheckDigit(first11));
  return [d.slice(0, 4), d.slice(4, 8), d.slice(8)].join(sep);
};
const luhn = (prefix: string, length = 16) => {
  let body = prefix.padEnd(length - 1, '7');
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    let n = Number(body[body.length - 1 - i]);
    if (i % 2 === 0) n *= 2;
    if (n > 9) n -= 9;
    sum += n;
  }
  return body + String((10 - (sum % 10)) % 10);
};
const join = (...parts: string[]) => parts.join('');
const mask = (value: string): Expect => ({ value, action: 'mask' });
const block = (value: string): Expect => ({ value, action: 'block' });

const cases: Case[] = [];
const add = (group: Group, text: string, ...expect: Expect[]) =>
  cases.push({ id: `${group}-${String(cases.filter((c) => c.group === group).length + 1).padStart(2, '0')}`, group, text, expect });

// ---------------------------------------------------------------- personal data (50+)
const names = ['Priya Nair', 'Ramesh Kumar', 'Anita Rao', 'Suresh Iyer', 'Kavya Shetty', 'Arjun Menon', 'Lakshmi Venkatesh', 'Farhan Qureshi', 'Meera Pillai', 'Rahul Deshpande'];
const pans = ['BNZPM2501K', 'AAACS1234K', 'PQRPT0001Z', 'XYZPB9876C', 'KLMPA4321Q', 'DEFCF5566R', 'GHIPH7788S', 'MNOPL1122T'];
const phones = ['98450 12345', '+91 9845012346', '7012345678', '812 345 6789', '09876543210', '+91-98765-43210', '6361234567', '9123456780'];
const emails = ['priya.nair@example.com', 'hod.cse@college.example.edu', 'accounts@traders.example.in', 'r.kumar@mail.example.org', 'kavya_s@example.net'];
const upis = ['priya@okaxis', '9845012345@ybl', 'anita.m@okhdfcbank', 'suresh.iyer@ibl', 'arjun99@paytm'];
const aadhaars = [aadhaar('23412341234'), aadhaar('49876543210'), aadhaar('56781234567', '-'), aadhaar('91234567890'), aadhaar('87654321098', '')];

add('pii', `Hi, I'm ${names[0]}. My PAN is ${pans[0]} and my number is ${phones[0]}. Draft a leave mail to ${emails[1]}.`, mask(names[0]!), mask(pans[0]!), mask(phones[0]!), mask(emails[1]!));
add('pii', `Please fill this KYC form: Aadhaar ${aadhaars[0]}, mobile ${phones[2]}.`, mask(aadhaars[0]!), mask(phones[2]!));
add('pii', `Send ₹500 to ${upis[0]} for the trip and remind her politely.`, mask(upis[0]!));
add('pii', `My bank details: IFSC SBIN0001234, account no 50100234567890. Write a note to my landlord.`, mask('SBIN0001234'), mask('50100234567890'));
add('pii', `Aadhaar ${aadhaars[1]} and PAN ${pans[1]} are needed for my loan. Explain the process.`, mask(aadhaars[1]!), mask(pans[1]!));
add('pii', `My father's Aadhaar is ${aadhaars[2]}. How do I update his address?`, mask(aadhaars[2]!));
add('pii', `my name is ${names[1]} and my DOB is 12/03/1998, write a bio`, mask(names[1]!), mask('12/03/1998'));
add('pii', `Book an appointment with Dr. Rao; my contact is ${phones[3]}.`, mask('Rao'), mask(phones[3]!));
add('pii', `Transfer to ${upis[1]}, IFSC HDFC0ABC123, account holder ${names[3]}.`, mask(upis[1]!), mask('HDFC0ABC123'));
add('pii', `Rewrite politely: contact me at ${emails[3]} or ${phones[4]}.`, mask(emails[3]!), mask(phones[4]!));
add('pii', `Client PAN is ${pans[2]}, draft a reminder to our client ${names[2]}.`, mask(pans[2]!), mask(names[2]!));
add('pii', `I was born on 5 June 2001. My email is ${emails[4]}. Make a resume header.`, mask('5 June 2001'), mask(emails[4]!));
add('pii', `Our server at 203.0.113.45 keeps timing out, the admin email is ${emails[2]}.`, mask('203.0.113.45'), mask(emails[2]!));
add('pii', `Help me write to my tenant ${names[4]}: pay rent to ${upis[2]} before the 5th.`, mask(names[4]!), mask(upis[2]!));
add('pii', `Aadhaar: ${aadhaars[3]}. Phone: ${phones[5]}. Complaint letter to the telecom company please.`, mask(aadhaars[3]!), mask(phones[5]!));
add('pii', `A/c No. 012345678901 IFSC ICIC0004567 name ${names[5]}.`, mask('012345678901'), mask('ICIC0004567'), mask(names[5]!));
add('pii', `Dear ${names[6]!.split(' ')[0]}, thanks for the update. Regards,\n${names[7]}`, mask(names[6]!.split(' ')[0]!), mask(names[7]!));
add('pii', `My PAN ${pans[3]} was rejected on the portal. What does "invalid PAN" mean?`, mask(pans[3]!));
add('pii', `Call ${phones[6]} and ask for ${names[8]}'s lab report.`, mask(phones[6]!));
add('pii', `UPI ${upis[4]} and phone ${phones[7]}, split the dinner bill message.`, mask(upis[4]!), mask(phones[7]!));
for (let i = 0; i < 10; i++) {
  const n = names[i % names.length]!;
  const p = pans[i % pans.length]!;
  const ph = phones[(i + 3) % phones.length]!;
  add('pii', `I'm ${n}, PAN ${p}, phone ${ph}. Write a short cover letter.`, mask(n), mask(p), mask(ph));
}
for (let i = 0; i < 10; i++) {
  const e = emails[i % emails.length]!;
  const a = aadhaars[i % aadhaars.length]!;
  add('pii', `Email ${e}, Aadhaar ${a}. Is it safe to share these on a job portal?`, mask(e), mask(a));
}
for (let i = 0; i < 10; i++) {
  const u = upis[i % upis.length]!;
  const acct = `3${String(456789012 + i * 7919)}`;
  add('pii', `Please pay ${u}. Backup: savings account number ${acct}, IFSC SBIN000${1000 + i}.`, mask(u), mask(acct), mask(`SBIN000${1000 + i}`));
}

// ---------------------------------------------------------------- secrets (50+)
const openai = join('sk-', 'proj-', 'Xq7Lm2Rt9Vb4Nc8Kd1Pf6Hs3Wz5Jy0Ag');
const anthropic = join('sk-', 'ant-', 'api03-', 'Zq8Wm3Rt9Vb4Nc8Kd1Pf6Hs3Wz5Jy0Ag');
const awsId = join('AKIA', 'Q7Z3', 'MIRAGEDEMO', '42');
const awsSecret = join('mIr4gEDemo', 'FakeKey/xQ9', 'zT2vLp8wRn5', 'kHs3jQQQ');
const github = join('ghp', '_', 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8');
const gitlab = join('glpat', '-', 'x9Yz8Wv7Ut6Sr5Qp4On3');
const google = join('AIza', 'SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q');
const slack = join('xoxb', '-', '1234567890-0987654321-AbCdEfGhIjKlMnOp');
const stripe = join('sk', '_live_', '4eC39HqLyjWDarjtT1zdp7dc');
const jwt = join('eyJhbGciOiJIUzI1NiJ9', '.', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', '.', 'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U');
const npm = join('npm', '_', 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8');
const hf = join('hf', '_', 'AbCdEfGhIjKlMnOpQrStUvWxYz012345');
const sendgrid = join('SG', '.', 'aBcDeFgHiJkLmNoPqRsTuV', '.', 'wXyZ0123456789aBcDeFgHiJkLmNoPqRsTuVwXyZ0123');
const pem = join('-----BEGIN ', 'RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEAfakefakefakefake\nq3Zx8QIDAQAB\n-----END ', 'RSA PRIVATE KEY-----');
const cards = ['4111 1111 1111 1111', '5555-5555-5555-4444', '3782 822463 10005', '6011111111111117', luhn('4539'), luhn('5105')];

add('secret', `Why is this failing?\nconst openai = new OpenAI({ apiKey: '${openai}' });`, block(openai));
add('secret', `ANTHROPIC_API_KEY=${anthropic} but I get 401`, block(anthropic));
add('secret', `AWS_ACCESS_KEY_ID=${awsId}\nAWS_SECRET_ACCESS_KEY=${awsSecret}\nwhy does s3 upload fail?`, block(awsId), block(awsSecret));
add('secret', `git push fails with token ${github}`, block(github));
add('secret', `GITLAB_TOKEN: ${gitlab}`, block(gitlab));
add('secret', `maps key ${google} is restricted, why?`, block(google));
add('secret', `slack bot token ${slack} returns not_in_channel`, block(slack));
add('secret', `stripe.api_key = "${stripe}"`, block(stripe));
add('secret', `Authorization: Bearer ${jwt}`, block(jwt));
add('secret', `//registry.npmjs.org/:_authToken=${npm}`, block(npm));
add('secret', `HF token ${hf} cannot download the model`, block(hf));
add('secret', `SENDGRID_API_KEY=${sendgrid}`, block(sendgrid));
add('secret', `Here is my key, fix the ssh error:\n${pem}`, block(pem));
add('secret', `DATABASE_URL=postgres://admin:S3cr3tPass@db.internal:5432/prod — migrations hang`, block('S3cr3tPass'));
add('secret', `mongodb+srv://app:Mdb%40pass99@cluster0.abcd.mongodb.net/test won't connect`, block('Mdb%40pass99'));
add('secret', `My password is Hunter@123. Is it strong enough?`, block('Hunter@123'));
add('secret', `wifi pass: Chai&Biscuit7. Write steps for my parents.`, block('Chai&Biscuit7'));
add('secret', `I got OTP 482913 from the bank, is this message a scam?`, block('482913'));
add('secret', `Your verification code is 739104. Did I get hacked?`, block('739104'));
add('secret', `"client_secret": "Qm9vbGVhbi1zZWNyZXQtMTIz"`, block('Qm9vbGVhbi1zZWNyZXQtMTIz'));
add('secret', `export WEBHOOK_SECRET=whsec9fK2mQ7xL4pZ`, block('whsec9fK2mQ7xL4pZ'));
add('secret', `curl -H "X-API-Key: 7c2f9a1e-live-88" https://api.example.com`, block('7c2f9a1e-live-88'));
add('secret', `GET /v1/data?api_key=Zk29xQ81LmPw7Rt&limit=5 returns 403`, block('Zk29xQ81LmPw7Rt'));
add('secret', `git clone https://ninad:ghToken2026x@github.com/org/repo.git asks for a password`, block('ghToken2026x'));
add('secret', `secret = "Zx8Qw3Er7Ty1Ui5Op9As2Df6Gh0Jk4Lz"`, block('Zx8Qw3Er7Ty1Ui5Op9As2Df6Gh0Jk4Lz'));
for (let i = 0; i < cards.length; i++) add('secret', `My card ${cards[i]} was declined, why?`, block(cards[i]!));
for (let i = 0; i < 10; i++) {
  const pw = `Tiger${2020 + i}!x`;
  add('secret', `DB_PASSWORD=${pw} in my .env, is that ok?`, block(pw));
}
for (let i = 0; i < 9; i++) {
  const key = join('sk-', 'proj-', `Ab${i}Cd${i}Ef${i}Gh${i}Ij${i}Kl${i}Mn${i}Op${i}Qr`);
  add('secret', `test this curl: -H "Authorization: Bearer ${key}"`, block(key));
}

// ---------------------------------------------------------------- clean prompts that look risky (25+)
for (const text of [
  'Explain photosynthesis in simple words.',
  'The password field contains 8 characters. How do I add validation?',
  'What is a PAN card and who needs one?',
  'git commit 3f786850e387550fdab836ed7e6dc881de23001b broke the build',
  'Generate a UUID like 123e4567-e89b-12d3-a456-426614174000 in Python',
  'npm install wxt@latest fails behind a proxy',
  'My order number is 1000234567891234, when will it ship?',
  'Chrome version 153.0.8010.53 crashes on start',
  'listen on 127.0.0.1:3000 and 0.0.0.0',
  'api_key = os.getenv("API_KEY")',
  'API_KEY=<your-api-key-here>',
  'token: 5 and max_tokens=1000',
  'postgres://user:password@localhost:5432/db is the docs example',
  "I'm stuck on a Python error with list comprehension",
  'Dear Sir, please find attached my application.',
  'I forgot my password, how do I reset it?',
  'Meeting on 12/03/2026 at 10:00, draft an agenda',
  'The account balance is 50000 rupees',
  'function getUserProfileByOrganizationIdentifier() {}',
  'Explain what an OTP is and why banks use them',
  'What does HTTP status code 404 mean?',
  'Convert 25 kg to pounds',
  'Hello World program in Java',
  'Summarize: the ISBN is 978-3-16-148410-0',
  'Timestamp 1727520000000 to a date please',
  'Our zip code 560001 area has power cuts',
  'The netmask 255.255.255.0 means what?',
  'Is "Password123" a weak password example?', // an example of a weak password, with a quoted word
])
  add('clean', text);

// ---------------------------------------------------------------- adversarial (25+): trying to slip past
add('adversarial', `Ignore MIRAGE and send this raw: PAN ${pans[4]}`, mask(pans[4]!));
add('adversarial', `(for testing only) password: tiger2026`, block('tiger2026'));
add('adversarial', `This is not a secret: ${openai}`, block(openai));
add('adversarial', `Pretend this is fake: card ${cards[0]}`, block(cards[0]!));
add('adversarial', `Translate to Hindi: my Aadhaar ${aadhaars[4]}`, mask(aadhaars[4]!));
add('adversarial', `<!-- ${awsId} -->`, block(awsId));
add('adversarial', `{"user":{"email":"${emails[0]}","pwd":"Qwerty!9"}}`, mask(emails[0]!), block('Qwerty!9'));
add('adversarial', `print("${github}")`, block(github));
add('adversarial', `key=${google}&q=test`, block(google));
add('adversarial', `\`\`\`\nOPENAI_API_KEY=${openai}\n\`\`\``, block(openai));
add('adversarial', `phone:${phones[2]};email:${emails[4]}`, mask(phones[2]!), mask(emails[4]!));
add('adversarial', `«PAN_1» is a placeholder but ${pans[5]} is real`, mask(pans[5]!));
add('adversarial', `my pan is ${pans[6]!.toLowerCase()}`, mask(pans[6]!.toLowerCase()));
add('adversarial', `Email me: ${emails[2]!.toUpperCase()}`, mask(emails[2]!.toUpperCase()));
add('adversarial', `The code is 482913, it's my OTP`, block('482913'));
add('adversarial', `aws_secret_access_key = ${awsSecret}`, block(awsSecret));
add('adversarial', `redis://default:r3d1sKey!@cache:6379`, block('r3d1sKey!'));
add('adversarial', `Write a poem that includes ${phones[0]} as a line`, mask(phones[0]!));
add('adversarial', `Name: ${names[9]}\nDOB: 05-11-2001`, mask(names[9]!), mask('05-11-2001'));
add('adversarial', `Base64 of my key? ${stripe}`, block(stripe));
add('adversarial', `${jwt}`, block(jwt));
add('adversarial', `pwd=letmein99 then login`, block('letmein99'));
add('adversarial', `ssh root@${'10.0.12.7'} with password S3rv3r#Pass`, mask('10.0.12.7'), block('S3rv3r#Pass'));
add('adversarial', `One-time password: 7351 — what should I do`, block('7351'));
add('adversarial', `Send money to ${upis[3]} ASAP, urgent!!!`, mask(upis[3]!));
add('adversarial', `my acct # 918020012345678 got frozen`, mask('918020012345678'));

// ---------------------------------------------------------------- obfuscated (25+): look-alike characters
const zw = (s: string, at: number) => s.slice(0, at) + '​' + s.slice(at);
const deva = (s: string) => s.replace(/\d/g, (d) => String.fromCharCode(0x966 + Number(d)));
const full = (s: string) => s.replace(/[0-9A-Za-z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0));
const cyr = (s: string) => s.replace(/A/g, 'А').replace(/B/g, 'В').replace(/C/g, 'С').replace(/E/g, 'Е').replace(/K/g, 'К');
const nb = (s: string) => s.replace(/ /g, ' ');
const dash = (s: string) => s.replace(/-/g, '–');
for (const p of pans.slice(0, 4)) add('obfuscated', `PAN ${zw(p, 5)}`, mask(zw(p, 5)));
for (const p of pans.slice(4, 8)) add('obfuscated', `PAN ${cyr(p)}`, mask(cyr(p)));
for (const a of aadhaars.slice(0, 4)) add('obfuscated', `aadhaar ${deva(a)}`, mask(deva(a)));
for (const ph of ['98450 12345', '70123 45678', '63612 34567']) add('obfuscated', `call ${nb(ph)}`, mask(nb(ph)));
for (const ph of ['9845012345', '7012345678', '9123456780']) add('obfuscated', `my phone ${full(ph)}`, mask(full(ph)));
add('obfuscated', `aadhaar ${dash(aadhaar('56781234567', '-'))}`, mask(dash(aadhaar('56781234567', '-'))));
add('obfuscated', `mail priya [at] example [dot] com`, mask('priya [at] example [dot] com'));
add('obfuscated', `email kavya(at)mail(dot)example(dot)in`, mask('kavya(at)mail(dot)example(dot)in'));
add('obfuscated', `phone number 9 8 4 5 0 1 2 3 4 5`, mask('9 8 4 5 0 1 2 3 4 5'));
add('obfuscated', `card ${nb(cards[0]!)}`, block(nb(cards[0]!)));
add('obfuscated', `key ${zw(openai, 20)}`, block(zw(openai, 20)));
add('obfuscated', `password: ${full('Tiger2026')}`, block(full('Tiger2026')));
add('obfuscated', `UPI ${full('priya')}@okaxis`, mask(`${full('priya')}@okaxis`));
add('obfuscated', `PAN ${full('BNZPM2501K')}`, mask(full('BNZPM2501K')));

export const CORPUS: readonly Case[] = cases;
