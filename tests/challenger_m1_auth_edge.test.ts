import http from 'http';
import assert from 'assert';
import jwt from 'jsonwebtoken';
import { startServer, stopServer } from '../src/server/index.js';
import { getDbClient } from '../src/server/db/client.js';
import { resetMockClock } from '../src/server/middleware/timezone.js';

const TEST_PORT = 3200;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const JWT_SECRET = process.env.JWT_SECRET || 'kotha-coffee-reception-session-secret-2026';

function httpRequest(options: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: any;
}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(options.path, BASE_URL);
    const reqHeaders: Record<string, string> = {
      ...(options.headers || {})
    };

    let payload: string | undefined;
    if (options.body !== undefined) {
      payload = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
      if (!reqHeaders['Content-Type']) {
        reqHeaders['Content-Type'] = 'application/json';
      }
      reqHeaders['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    const req = http.request(
      url,
      {
        method: options.method,
        headers: reqHeaders
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          let parsed: any = data;
          try {
            parsed = JSON.parse(data);
          } catch {
            // Keep raw string
          }
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: parsed
          });
        });
      }
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

interface TestResult {
  category: string;
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

const testResults: TestResult[] = [];

function recordResult(result: TestResult) {
  testResults.push(result);
  const mark = result.passed ? '✅' : '❌';
  console.log(`  ${mark} [${result.category}] ${result.name}`);
  if (!result.passed) {
    console.log(`     Expected: ${result.expected}`);
    console.log(`     Actual:   ${result.actual}`);
    if (result.details) console.log(`     Details:  ${result.details}`);
  }
}

async function runChallengerSuite() {
  console.log('================================================================');
  console.log('  CHALLENGER 2: ADVERSARIAL AUTH & EDGE CASE EMPIRICAL TEST SUITE');
  console.log('================================================================\n');

  process.env.NODE_ENV = 'test';
  process.env.PORT = String(TEST_PORT);

  await startServer(TEST_PORT);
  console.log(`Test server running on port ${TEST_PORT}\n`);

  try {
    // -------------------------------------------------------------------------
    // CATEGORY 1: Direct HTTP Mutations Without Token
    // -------------------------------------------------------------------------
    console.log('--- CATEGORY 1: Direct HTTP Mutations Without Token ---');

    const unauthEndpoints = [
      { method: 'POST', path: '/api/orders', body: { items: [{ name: 'Espresso', qty: 1 }] } },
      { method: 'PUT', path: '/api/orders/order-123', body: { items: [] } },
      { method: 'PATCH', path: '/api/orders/order-123', body: { paymentMethod: 'UPI' } },
      { method: 'DELETE', path: '/api/orders/order-123' },
      { method: 'POST', path: '/api/orders/order-123/done' },
      { method: 'POST', path: '/api/menu', body: { name: 'Latte', price: 150 } },
      { method: 'PUT', path: '/api/menu/menu-item-1', body: { price: 180 } },
      { method: 'DELETE', path: '/api/menu/menu-item-1' },
      { method: 'POST', path: '/api/auth/change-pin', body: { currentPin: '1234', newPin: '9999' } }
    ];

    for (const ep of unauthEndpoints) {
      const res = await httpRequest({
        method: ep.method,
        path: ep.path,
        body: ep.body
      });
      const passed = res.status === 401;
      recordResult({
        category: 'Unauth Route Guard',
        name: `${ep.method} ${ep.path} rejected without token`,
        passed,
        expected: 'HTTP 401',
        actual: `HTTP ${res.status}`
      });
    }

    // Edge cases for Authorization header format
    const emptyAuthHeaders = [
      { name: 'Empty string Authorization', value: '' },
      { name: 'Bearer only with no token', value: 'Bearer' },
      { name: 'Bearer with trailing spaces only', value: 'Bearer   ' },
      { name: 'Basic auth credentials', value: 'Basic dXNlcjpwYXNz' },
      { name: 'Token without Bearer prefix', value: 'some-random-token-here' }
    ];

    for (const h of emptyAuthHeaders) {
      const res = await httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: { Authorization: h.value },
        body: { items: [] }
      });
      recordResult({
        category: 'Auth Header Parsing',
        name: `Malformed Authorization header (${h.name}) returns 401`,
        passed: res.status === 401,
        expected: 'HTTP 401',
        actual: `HTTP ${res.status}`
      });
    }

    // -------------------------------------------------------------------------
    // CATEGORY 2: Forged, Tampered, and Expired Tokens
    // -------------------------------------------------------------------------
    console.log('\n--- CATEGORY 2: Forged, Tampered, and Expired Tokens ---');

    // 2.1 Token signed with wrong secret
    const wrongSecretToken = jwt.sign(
      { role: 'reception', cafe: 'kotha-coffee' },
      'attacker-rogue-secret-9999',
      { expiresIn: 3600 }
    );
    const wrongSecretRes = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: { Authorization: `Bearer ${wrongSecretToken}` },
      body: { items: [] }
    });
    recordResult({
      category: 'Forged Token',
      name: 'Token signed with wrong secret rejected with 401',
      passed: wrongSecretRes.status === 401,
      expected: 'HTTP 401',
      actual: `HTTP ${wrongSecretRes.status}`
    });

    // 2.2 Expired token
    const expiredToken = jwt.sign(
      { role: 'reception', cafe: 'kotha-coffee', iat: Math.floor(Date.now() / 1000) - 7200 },
      JWT_SECRET,
      { expiresIn: -10 } // Expired 10 seconds ago
    );
    const expiredRes = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: { Authorization: `Bearer ${expiredToken}` },
      body: { items: [] }
    });
    recordResult({
      category: 'Expired Token',
      name: 'Expired session token rejected with 401',
      passed: expiredRes.status === 401,
      expected: 'HTTP 401',
      actual: `HTTP ${expiredRes.status}`
    });

    // 2.3 Tampered signature
    const validToken = jwt.sign(
      { role: 'reception', cafe: 'kotha-coffee' },
      JWT_SECRET,
      { expiresIn: 3600 }
    );
    const tamperedToken = validToken.substring(0, validToken.length - 6) + 'XXXXXX';
    const tamperedRes = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: { Authorization: `Bearer ${tamperedToken}` },
      body: { items: [] }
    });
    recordResult({
      category: 'Tampered Token',
      name: 'Token with corrupted signature rejected with 401',
      passed: tamperedRes.status === 401,
      expected: 'HTTP 401',
      actual: `HTTP ${tamperedRes.status}`
    });

    // 2.4 Algorithm none attack
    const headerB64 = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify({ role: 'reception', cafe: 'kotha-coffee' })).toString('base64url');
    const algNoneToken = `${headerB64}.${payloadB64}.`;
    const algNoneRes = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: { Authorization: `Bearer ${algNoneToken}` },
      body: { items: [] }
    });
    recordResult({
      category: 'Alg None Attack',
      name: 'Token with alg: "none" rejected with 401',
      passed: algNoneRes.status === 401,
      expected: 'HTTP 401',
      actual: `HTTP ${algNoneRes.status}`
    });

    // 2.5 Wrong role in token
    const wrongRoles = ['kitchen', 'customer', 'admin', '', undefined];
    for (const role of wrongRoles) {
      const wrongRoleToken = jwt.sign(
        { role, cafe: 'kotha-coffee' },
        JWT_SECRET,
        { expiresIn: 3600 }
      );
      const roleRes = await httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: { Authorization: `Bearer ${wrongRoleToken}` },
        body: { items: [] }
      });
      recordResult({
        category: 'Role Enforcement',
        name: `Token with role="${role}" rejected with 401`,
        passed: roleRes.status === 401,
        expected: 'HTTP 401',
        actual: `HTTP ${roleRes.status}`
      });
    }

    // 2.6 Malformed token strings
    const malformedTokens = [
      'not.a.jwt',
      'gibberish!@#$%',
      'header.payload', // only 2 parts
      'header.payload.signature.extra' // 4 parts
    ];
    for (const mt of malformedTokens) {
      const mfRes = await httpRequest({
        method: 'POST',
        path: '/api/orders',
        headers: { Authorization: `Bearer ${mt}` },
        body: { items: [] }
      });
      recordResult({
        category: 'Malformed Token',
        name: `Malformed token "${mt}" rejected with 401`,
        passed: mfRes.status === 401,
        expected: 'HTTP 401',
        actual: `HTTP ${mfRes.status}`
      });
    }

    // 2.7 Alternative header: x-session-token
    const validHeaderTokenRes = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: { 'x-session-token': validToken },
      body: { items: [] }
    });
    // Since /api/orders POST route handler is not implemented yet, auth passes and returns 404
    recordResult({
      category: 'Session Token Header',
      name: 'Valid token in x-session-token passes auth guard (not 401)',
      passed: validHeaderTokenRes.status !== 401,
      expected: 'Passes auth (HTTP != 401)',
      actual: `HTTP ${validHeaderTokenRes.status}`
    });

    const invalidHeaderTokenRes = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: { 'x-session-token': 'invalid-token' },
      body: { items: [] }
    });
    recordResult({
      category: 'Session Token Header',
      name: 'Invalid token in x-session-token returns 401',
      passed: invalidHeaderTokenRes.status === 401,
      expected: 'HTTP 401',
      actual: `HTTP ${invalidHeaderTokenRes.status}`
    });

    // -------------------------------------------------------------------------
    // CATEGORY 3: Malformed & Boundary Inputs on POST /api/auth/verify-pin
    // -------------------------------------------------------------------------
    console.log('\n--- CATEGORY 3: PIN Verification Input Edge Cases ---');

    const pinEdgeCases = [
      { label: 'Empty JSON object {}', body: {}, expectedStatus: 401 },
      { label: 'null pin: { pin: null }', body: { pin: null }, expectedStatus: 401 },
      { label: 'undefined pin: { pin: undefined }', body: { pin: undefined }, expectedStatus: 401 },
      { label: 'boolean pin: { pin: true }', body: { pin: true }, expectedStatus: 401 },
      { label: 'boolean pin: { pin: false }', body: { pin: false }, expectedStatus: 401 },
      { label: 'numeric pin: { pin: 1234 }', body: { pin: 1234 }, expectedStatus: 401 },
      { label: 'array pin: { pin: ["1234"] }', body: { pin: ['1234'] }, expectedStatus: 401 },
      { label: 'nested object pin: { pin: { code: "1234" } }', body: { pin: { code: '1234' } }, expectedStatus: 401 },
      { label: 'empty string: { pin: "" }', body: { pin: '' }, expectedStatus: 401 },
      { label: 'whitespace only: { pin: "    " }', body: { pin: '    ' }, expectedStatus: 401 },
      { label: 'SQL Injection: { pin: "\' OR 1=1 --" }', body: { pin: "' OR 1=1 --" }, expectedStatus: 401 },
      { label: 'SQL Injection: { pin: "1234\'; DROP TABLE settings;--" }', body: { pin: "1234'; DROP TABLE settings;--" }, expectedStatus: 401 },
      { label: 'Null byte injection: { pin: "1234\\0" }', body: { pin: '1234\0' }, expectedStatus: 401 },
      { label: 'Unicode / Emoji: { pin: "☕1234" }', body: { pin: '☕1234' }, expectedStatus: 401 },
      { label: 'Oversized PIN (10,000 chars)', body: { pin: '9'.repeat(10000) }, expectedStatus: 401 },
      { label: 'Wrong PIN: { pin: "9999" }', body: { pin: '9999' }, expectedStatus: 401 }
    ];

    for (const ec of pinEdgeCases) {
      const res = await httpRequest({
        method: 'POST',
        path: '/api/auth/verify-pin',
        body: ec.body
      });
      const passed = res.status === ec.expectedStatus;
      recordResult({
        category: 'PIN Input Edge Cases',
        name: `verify-pin with ${ec.label}`,
        passed,
        expected: `HTTP ${ec.expectedStatus}`,
        actual: `HTTP ${res.status} (${JSON.stringify(res.body)})`
      });
    }

    // Verify database settings table is still intact after SQL injection attempts
    const db = getDbClient();
    const settingsCheck = await db.execute(`SELECT name FROM sqlite_master WHERE type='table' AND name='settings';`);
    recordResult({
      category: 'SQL Injection Defense',
      name: 'settings table survives SQL injection attempts',
      passed: settingsCheck.rows.length === 1,
      expected: 'settings table exists',
      actual: settingsCheck.rows.length === 1 ? 'settings table intact' : 'TABLE MISSING'
    });

    // Valid PIN
    const validPinRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/verify-pin',
      body: { pin: '1234' }
    });
    recordResult({
      category: 'Valid PIN',
      name: 'verify-pin with correct PIN "1234" returns 200 with token',
      passed: validPinRes.status === 200 && !!validPinRes.body.token && validPinRes.body.expiresIn === 43200,
      expected: 'HTTP 200, token present, expiresIn=43200',
      actual: `HTTP ${validPinRes.status}, expiresIn=${validPinRes.body?.expiresIn}`
    });

    // Valid PIN with surrounding whitespace
    const whitespacePinRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/verify-pin',
      body: { pin: '  1234  ' }
    });
    recordResult({
      category: 'Valid PIN',
      name: 'verify-pin trims surrounding whitespace',
      passed: whitespacePinRes.status === 200 && !!whitespacePinRes.body.token,
      expected: 'HTTP 200 with token',
      actual: `HTTP ${whitespacePinRes.status}`
    });

    const staffToken = validPinRes.body.token;

    // -------------------------------------------------------------------------
    // CATEGORY 4: PIN Change Boundary & Input Validation (`POST /api/auth/change-pin`)
    // -------------------------------------------------------------------------
    console.log('\n--- CATEGORY 4: PIN Change Boundary & Edge Cases ---');

    // 4.1 Unauthenticated PIN change
    const unauthChangeRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/change-pin',
      body: { currentPin: '1234', newPin: '8888' }
    });
    recordResult({
      category: 'Change PIN Auth',
      name: 'Unauthenticated change-pin returns 401',
      passed: unauthChangeRes.status === 401,
      expected: 'HTTP 401',
      actual: `HTTP ${unauthChangeRes.status}`
    });

    // 4.2 Malformed change-pin payloads
    const changePinEdgeCases = [
      { label: 'Empty body {}', body: {}, expectedStatus: 400 },
      { label: 'Short PIN "123"', body: { currentPin: '1234', newPin: '123' }, expectedStatus: 400 },
      { label: 'Empty string newPin ""', body: { currentPin: '1234', newPin: '' }, expectedStatus: 400 },
      { label: 'Whitespace newPin "   "', body: { currentPin: '1234', newPin: '   ' }, expectedStatus: 400 },
      { label: 'Whitespace-padded short PIN "  12  "', body: { currentPin: '1234', newPin: '  12  ' }, expectedStatus: 400 },
      { label: 'Number newPin { newPin: 5678 }', body: { currentPin: '1234', newPin: 5678 }, expectedStatus: 400 },
      { label: 'null newPin', body: { currentPin: '1234', newPin: null }, expectedStatus: 400 },
      { label: 'Wrong currentPin: { currentPin: "0000", newPin: "5678" }', body: { currentPin: '0000', newPin: '5678' }, expectedStatus: 401 }
    ];

    for (const cpec of changePinEdgeCases) {
      const res = await httpRequest({
        method: 'POST',
        path: '/api/auth/change-pin',
        headers: { Authorization: `Bearer ${staffToken}` },
        body: cpec.body
      });
      recordResult({
        category: 'Change PIN Input',
        name: `change-pin with ${cpec.label}`,
        passed: res.status === cpec.expectedStatus,
        expected: `HTTP ${cpec.expectedStatus}`,
        actual: `HTTP ${res.status} (${JSON.stringify(res.body)})`
      });
    }

    // 4.3 EMPIRICAL TEST: Is currentPin strictly required by change-pin?
    // Contract in PROJECT.md: { currentPin: string, newPin: string }
    const omitCurrentPinRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/change-pin',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: { newPin: '7777' }
    });
    // Notice: if currentPin is omitted, does the endpoint accept it without currentPin verification?
    const allowsOmittedCurrentPin = omitCurrentPinRes.status === 200;
    recordResult({
      category: 'Change PIN Security Audit',
      name: 'change-pin without currentPin: requires currentPin vs allows token-only update',
      passed: true, // We observe empirical behavior and report it
      expected: 'Observe if currentPin is mandatory or optional',
      actual: allowsOmittedCurrentPin
        ? 'ALLOWED: Endpoint permits PIN update without currentPin (token-only authentication)'
        : `REJECTED: HTTP ${omitCurrentPinRes.status} (${JSON.stringify(omitCurrentPinRes.body)})`,
      details: allowsOmittedCurrentPin
        ? 'FINDING: Staff with an unlocked phone session can change the owner PIN without knowing the current PIN.'
        : undefined,
      severity: allowsOmittedCurrentPin ? 'MEDIUM' : undefined
    });

    // Reset PIN back if it was changed
    if (allowsOmittedCurrentPin) {
      await httpRequest({
        method: 'POST',
        path: '/api/auth/change-pin',
        headers: { Authorization: `Bearer ${staffToken}` },
        body: { currentPin: '7777', newPin: '1234' }
      });
    }

    // 4.4 EMPIRICAL TEST: Does change-pin enforce purely numeric PIN?
    // Requirement R8: "protected by a simple numeric PIN that the owner can set or change"
    const nonNumericChangeRes = await httpRequest({
      method: 'POST',
      path: '/api/auth/change-pin',
      headers: { Authorization: `Bearer ${staffToken}` },
      body: { currentPin: '1234', newPin: 'abcd' }
    });
    const acceptsNonNumeric = nonNumericChangeRes.status === 200;
    recordResult({
      category: 'Change PIN Security Audit',
      name: 'change-pin rejects non-numeric characters (R8 numeric PIN requirement)',
      passed: !acceptsNonNumeric,
      expected: 'HTTP 400 (rejected non-numeric)',
      actual: acceptsNonNumeric
        ? 'ALLOWED: HTTP 200 (Accepted alphabetic PIN "abcd")'
        : `REJECTED: HTTP ${nonNumericChangeRes.status}`,
      details: acceptsNonNumeric
        ? 'FINDING: R8 specifies a "simple numeric PIN". PinModal has numeric-only keys. Accepting alphabetic characters could lock users out.'
        : undefined,
      severity: acceptsNonNumeric ? 'LOW' : undefined
    });

    // Reset PIN if changed to abcd
    if (acceptsNonNumeric) {
      await httpRequest({
        method: 'POST',
        path: '/api/auth/change-pin',
        headers: { Authorization: `Bearer ${staffToken}` },
        body: { currentPin: 'abcd', newPin: '1234' }
      });
    }

    // -------------------------------------------------------------------------
    // CATEGORY 5: Alternative Headers & Production Mode Security
    // -------------------------------------------------------------------------
    console.log('\n--- CATEGORY 5: Headers & Production Guard Audit ---');

    // 5.1 x-admin-pin header check
    const correctPinHeaderRes = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: { 'x-admin-pin': '1234' },
      body: { items: [] }
    });
    recordResult({
      category: 'x-admin-pin Header',
      name: 'x-admin-pin with correct PIN allows request through auth guard',
      passed: correctPinHeaderRes.status !== 401,
      expected: 'HTTP != 401',
      actual: `HTTP ${correctPinHeaderRes.status}`
    });

    const wrongPinHeaderRes = await httpRequest({
      method: 'POST',
      path: '/api/orders',
      headers: { 'x-admin-pin': '0000' },
      body: { items: [] }
    });
    recordResult({
      category: 'x-admin-pin Header',
      name: 'x-admin-pin with wrong PIN rejected with 401',
      passed: wrongPinHeaderRes.status === 401,
      expected: 'HTTP 401',
      actual: `HTTP ${wrongPinHeaderRes.status}`
    });

    // 5.2 Production mode on /api/test/*
    process.env.NODE_ENV = 'production';
    const prodSetTimeRes = await httpRequest({
      method: 'POST',
      path: '/api/test/set-time',
      body: { dateKey: '2028-01-01' }
    });
    const prodResetTimeRes = await httpRequest({
      method: 'POST',
      path: '/api/test/reset-time'
    });
    const prodResetDbRes = await httpRequest({
      method: 'POST',
      path: '/api/test/reset'
    });

    recordResult({
      category: 'Production Guard',
      name: 'POST /api/test/set-time blocked with 403 in production',
      passed: prodSetTimeRes.status === 403,
      expected: 'HTTP 403',
      actual: `HTTP ${prodSetTimeRes.status}`
    });
    recordResult({
      category: 'Production Guard',
      name: 'POST /api/test/reset-time blocked with 403 in production',
      passed: prodResetTimeRes.status === 403,
      expected: 'HTTP 403',
      actual: `HTTP ${prodResetTimeRes.status}`
    });
    recordResult({
      category: 'Production Guard',
      name: 'POST /api/test/reset blocked with 403 in production',
      passed: prodResetDbRes.status === 403,
      expected: 'HTTP 403',
      actual: `HTTP ${prodResetDbRes.status}`
    });

    // 5.3 Production mode check for X-Mock-Date header
    // When NODE_ENV === 'production', does X-Mock-Date allow overriding dateKey?
    const prodMockDateHealth = await httpRequest({
      method: 'GET',
      path: '/api/health',
      headers: { 'X-Mock-Date': '2099-12-31' }
    });
    const mockDateHonoredInProd = prodMockDateHealth.body?.dateKey === '2099-12-31';
    recordResult({
      category: 'Production Guard Audit',
      name: 'X-Mock-Date header behavior in production environment',
      passed: true,
      expected: 'Observe if X-Mock-Date is active in production',
      actual: mockDateHonoredInProd
        ? 'ACTIVE: X-Mock-Date header overrides dateKey even when NODE_ENV=production'
        : 'IGNORED: X-Mock-Date header ignored in production',
      details: mockDateHonoredInProd
        ? 'FINDING: In timezoneMiddleware, X-Mock-Date is evaluated without checking process.env.NODE_ENV !== "production". While convenient for testing, in production an external caller could potentially influence date_key by passing this header.'
        : undefined,
      severity: mockDateHonoredInProd ? 'MEDIUM' : undefined
    });

    // -------------------------------------------------------------------------
    // CATEGORY 6: Concurrent Interleaved Date Sequences
    // -------------------------------------------------------------------------
    console.log('\n--- CATEGORY 6: Concurrent Interleaved Date Sequences ---');
    const { getNextDailyOrderNumber, resetDailyCounter } = await import('../src/server/db/sequence.js');
    const dateA = '2026-10-20';
    const dateB = '2026-10-21';
    await resetDailyCounter(dateA);
    await resetDailyCounter(dateB);

    const interleavedPromises: Promise<{ date: string; num: number }>[] = [];
    for (let i = 0; i < 20; i++) {
      interleavedPromises.push(getNextDailyOrderNumber(dateA).then((num) => ({ date: dateA, num })));
      interleavedPromises.push(getNextDailyOrderNumber(dateB).then((num) => ({ date: dateB, num })));
    }

    const interleavedResults = await Promise.all(interleavedPromises);
    const resultsA = interleavedResults.filter((r) => r.date === dateA).map((r) => r.num).sort((a, b) => a - b);
    const resultsB = interleavedResults.filter((r) => r.date === dateB).map((r) => r.num).sort((a, b) => a - b);

    const isAValid = resultsA.length === 20 && resultsA.every((val, idx) => val === idx + 1);
    const isBValid = resultsB.length === 20 && resultsB.every((val, idx) => val === idx + 1);

    recordResult({
      category: 'Concurrency Partitioning',
      name: 'Interleaved concurrent orders across 2 distinct dateKeys maintain independent sequential #1..#20 sequences',
      passed: isAValid && isBValid,
      expected: 'Date A: 1..20, Date B: 1..20',
      actual: `Date A: len=${resultsA.length} min=${resultsA[0]} max=${resultsA[19]}, Date B: len=${resultsB.length} min=${resultsB[0]} max=${resultsB[19]}`
    });

    // Restore NODE_ENV
    process.env.NODE_ENV = 'test';

  } finally {
    resetMockClock();
    await stopServer();
    console.log('\nServer shutdown complete.\n');
  }

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('================================================================');
  console.log('                   TEST SUITE SUMMARY');
  console.log('================================================================');
  const total = testResults.length;
  const passed = testResults.filter((r) => r.passed).length;
  const failed = testResults.filter((r) => !r.passed).length;

  console.log(`Total Tests Run: ${total}`);
  console.log(`Passed:         ${passed}`);
  console.log(`Failed:         ${failed}`);
  console.log('================================================================\n');

  const findings = testResults.filter((r) => r.details);
  if (findings.length > 0) {
    console.log('Notable Security & Quality Observations:');
    for (const f of findings) {
      console.log(`- [${f.severity || 'INFO'}] ${f.name}`);
      console.log(`  Actual:  ${f.actual}`);
      console.log(`  Details: ${f.details}\n`);
    }
  }

  return { total, passed, failed, findings };
}

runChallengerSuite().catch((err) => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
