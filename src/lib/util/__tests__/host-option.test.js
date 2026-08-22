import { describe, test, expect } from '@jest/globals';
import { InvalidArgumentError } from 'commander';
import SenseUtilities from 'enigma.js/sense-utilities.js';
import { hostOptionParser } from '../host-option.js';
import { redactSensitivePatterns } from '../redact-secrets.js';

const parseTenant = hostOptionParser({ example: 'tenant.eu.qlikcloud.com' });
const parseHost = hostOptionParser({
    example: 'sense.example.com',
    pathHint: 'A virtual proxy prefix, if there is one, goes in --prefix.',
});

describe('hostOptionParser', () => {
    test('a bare host is what comes back out', () => {
        expect(parseTenant('tenant.eu.qlikcloud.com')).toBe('tenant.eu.qlikcloud.com');
    });

    test.each([
        ['https://tenant.eu.qlikcloud.com', 'tenant.eu.qlikcloud.com'],
        ['http://tenant.eu.qlikcloud.com', 'tenant.eu.qlikcloud.com'],
        // A browser address bar hands over the trailing slash along with the
        // scheme, and left in place it produces `wss://host//app/<id>`.
        ['https://tenant.eu.qlikcloud.com/', 'tenant.eu.qlikcloud.com'],
        ['tenant.eu.qlikcloud.com/', 'tenant.eu.qlikcloud.com'],
        ['https://tenant.eu.qlikcloud.com//', 'tenant.eu.qlikcloud.com'],
        ['  https://tenant.eu.qlikcloud.com  ', 'tenant.eu.qlikcloud.com'],
        // One slash short of a scheme. The regex this replaced let it through
        // verbatim, reproducing `getaddrinfo ENOTFOUND https` with a green tick
        // at the prompt.
        ['https:tenant.eu.qlikcloud.com', 'tenant.eu.qlikcloud.com'],
        // Protocol-relative, as some tools copy it.
        ['//tenant.eu.qlikcloud.com', 'tenant.eu.qlikcloud.com'],
        ['https:\\\\tenant.eu.qlikcloud.com', 'tenant.eu.qlikcloud.com'],
    ])('%s becomes %s', (input, expected) => {
        expect(parseTenant(input)).toBe(expected);
    });

    // Host names are case-insensitive, and this is what DNS resolves either way.
    test('the host comes back as the URL parser spells it', () => {
        expect(parseTenant('HTTPS://Tenant.EU.Qlikcloud.COM')).toBe('tenant.eu.qlikcloud.com');
        expect(parseHost('bücher.example')).toBe('xn--bcher-kva.example');
    });

    test.each([['192.168.1.10'], ['localhost'], ['[2001:db8::1]'], ['sense.example.com.']])(
        'a host that is not a domain name, %s, passes through intact',
        (host) => {
            expect(parseHost(host)).toBe(host);
        }
    );

    test('an IPv6 literal keeps its brackets, which is how the engine url needs it', () => {
        const host = parseHost('https://[2001:db8::1]/');

        expect(host).toBe('[2001:db8::1]');
        expect(SenseUtilities.buildUrl({ host, port: 4747, secure: true, appId: 'a' })).toBe(
            'wss://[2001:db8::1]:4747/app/a'
        );
    });

    describe('refusals', () => {
        // InvalidArgumentError specifically: Commander turns it into an option
        // error naming the flag and the value, and the wizard's validator shows
        // `err.message` inline under the prompt.
        test('are InvalidArgumentErrors, so Commander and the wizard both report them', () => {
            expect(() => parseHost('https://sense.example.com/form/hub')).toThrow(
                InvalidArgumentError
            );
        });

        // Both options this serves are mandatory with no default, and Commander's
        // missing-mandatory check does not catch a variable that is set but empty
        // - so blank has to be refused here, or `BSI_QSEOW_CST_HOST=` runs against
        // nothing. It is also the wizard's only "required" check once an option
        // has a parser.
        test('a blank value is refused, naming what to enter', () => {
            expect(() => parseHost('')).toThrow('Enter the host, for example "sense.example.com".');
            expect(() => parseHost('   ')).toThrow(
                'Enter the host, for example "sense.example.com".'
            );
        });

        test('a path is refused rather than silently dropped', () => {
            expect(() => parseHost('https://sense.example.com/form/hub')).toThrow(
                /a path is not part of it/
            );
        });

        // Dropping `/form` would leave a run that authenticates and then fails
        // ninety seconds later on a selector that says nothing about a prefix.
        // The hint is conditional on purpose: `https://server/hub` has a path and
        // no prefix, and "goes in --prefix" would be wrong advice for it.
        test('refusing a path names where a prefix belongs, when the caller says so', () => {
            expect(() => parseHost('https://sense.example.com/hub')).toThrow(
                'A virtual proxy prefix, if there is one, goes in --prefix.'
            );
            expect(() => parseTenant('https://tenant.eu.qlikcloud.com/sense/app/x')).toThrow(
                /a path is not part of it/
            );
            expect(() => parseTenant('https://tenant.eu.qlikcloud.com/sense/app/x')).not.toThrow(
                /--prefix/
            );
        });

        test.each([
            ['a query string', 'https://tenant.eu.qlikcloud.com?qlik-web-integration-id=abc'],
            ['a fragment', 'https://tenant.eu.qlikcloud.com#/hub'],
        ])('%s is refused as a path, not glued onto the host', (_label, input) => {
            expect(() => parseTenant(input)).toThrow(/a path is not part of it/);
        });

        // The port has its own options on QSEoW, and every consumer appends one
        // to the host - so `host:8443` became `wss://host:8443:4747/…`, the
        // same shape #1148 was about.
        test.each([['https://sense.example.com:8443/'], ['sense.example.com:4242']])(
            'a port, as in %s, is refused and pointed at the port options',
            (input) => {
                expect(() => parseHost(input)).toThrow(
                    /A port is not part of the host - the ports have their own options/
                );
            }
        );

        test('a scheme other than http(s) is reported as such, not as a path', () => {
            expect(() => parseHost('ftp://sense.example.com')).toThrow(
                /Only "https:\/\/" and "http:\/\/" are recognised/
            );
            // Even with nothing after it: the regex this replaced stripped the
            // trailing slashes first and accepted `ftp:` as a host.
            expect(() => parseHost('ftp://')).toThrow(
                /Only "https:\/\/" and "http:\/\/" are recognised/
            );
        });

        test.each([['https://'], ['/'], ['///'], ['://'], ['sense example.com']])(
            '%s is refused as not a host name, without inventing a scheme to blame',
            (input) => {
                expect(() => parseHost(input)).toThrow(/That is not a host name/);
                expect(() => parseHost(input)).not.toThrow(/scheme/);
            }
        );

        test('the message quotes the platform its option belongs to', () => {
            expect(() => parseTenant('https://')).toThrow(/tenant\.eu\.qlikcloud\.com/);
            expect(() => parseHost('https://')).toThrow(/sense\.example\.com/);
        });
    });

    describe('credentials in the host', () => {
        const PASTED = 'https://svc-bsi:Sup3rSecret@sense.example.com';

        test('are refused, with the options they belong in named instead', () => {
            expect(() => parseHost(PASTED)).toThrow(/Credentials are not part of the host/);
            expect(() => parseHost('svc-bsi:Sup3rSecret@sense.example.com')).toThrow(
                /Credentials are not part of the host/
            );
        });

        // The log redactor recognises embedded credentials only behind a scheme,
        // and the scheme is exactly what this parser removes - so a parser that
        // returned `user:pass@host` would have every log line that prints the
        // host print the password. Refusing is what keeps the redactor's
        // guarantee: nothing this parser returns can carry credentials, and
        // nothing it says repeats them.
        test('never reach a log line, because neither the host nor the message carries them', () => {
            let message;
            try {
                parseHost(PASTED);
            } catch (err) {
                message = err.message;
            }

            expect(message).not.toContain('Sup3rSecret');
            expect(message).not.toContain('svc-bsi');
            // The pre-fix shape, for contrast: with the scheme gone the redactor
            // no longer sees credentials to redact.
            expect(redactSensitivePatterns(`on host ${PASTED}`)).toContain('[REDACTED]@');
            expect(
                redactSensitivePatterns('on host svc-bsi:Sup3rSecret@sense.example.com')
            ).toContain('Sup3rSecret');
        });
    });
});

// The point of the parser, stated as the URL that failed in issue #1148.
// `SenseUtilities.buildUrl` is what both platforms' engine connections call, and
// it prepends a scheme of its own, so it is only correct when handed a bare host.
describe('the engine url a pasted tenant url used to break', () => {
    const PASTED = 'https://tenant.eu.qlikcloud.com';

    test('the parsed value produces the engine url the tenant answers on', () => {
        expect(
            SenseUtilities.buildUrl({ host: parseTenant(PASTED), secure: true, appId: 'app-1' })
        ).toBe('wss://tenant.eu.qlikcloud.com/app/app-1');
    });

    test('the QSEoW twin is fixed by the same parser', () => {
        const host = parseHost('https://sense.example.com');

        expect(SenseUtilities.buildUrl({ host, port: 4747, secure: true, appId: 'app-1' })).toBe(
            'wss://sense.example.com:4747/app/app-1'
        );
    });
});
