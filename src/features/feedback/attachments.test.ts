import { describe, expect, it } from 'vitest'

import { attachmentKind, isSafeAttachment, safeAttachmentHref } from './attachments'

/**
 * The security test for feedback_management_plan.md §3.9.
 *
 * The backend stores `fileUrl` exactly as an ordinary app user submits it — no
 * URL parse, no scheme check, no host allowlist. The first case below is the
 * literal payload accepted by the live API on 2026-09-06 from a normal user
 * account. If `safeAttachmentHref` ever returns a string for it, an admin
 * panel that renders attachments as links executes an attacker's script in a
 * Super Admin's session.
 */

describe('safeAttachmentHref', () => {
  it('refuses the exact payload the live API accepted', () => {
    expect(safeAttachmentHref('javascript:alert(document.domain)')).toBeNull()
  })

  it.each([
    ['uppercase scheme', 'JavaScript:alert(1)'],
    ['leading whitespace', '  javascript:alert(1)'],
    ['embedded newline', 'java\nscript:alert(1)'],
    ['tab-split scheme', 'java\tscript:alert(1)'],
  ])('refuses %s', (_label, value) => {
    /*
     * Parsing with `new URL()` rather than a regex is what makes these free:
     * the parser strips control characters and normalises case exactly as the
     * browser would before following the href, so there is no gap between what
     * this judges and what would actually run.
     */
    expect(safeAttachmentHref(value)).toBeNull()
  })

  it('refuses data: URLs', () => {
    expect(
      safeAttachmentHref('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='),
    ).toBeNull()
  })

  it('refuses blob: URLs', () => {
    expect(safeAttachmentHref('blob:https://example.com/abc')).toBeNull()
  })

  it('refuses plain http, because an admin session must not downgrade', () => {
    expect(safeAttachmentHref('http://media.callschat.com/a.png')).toBeNull()
  })

  it('refuses file: and other local schemes', () => {
    expect(safeAttachmentHref('file:///etc/passwd')).toBeNull()
    expect(safeAttachmentHref('ftp://example.com/a.png')).toBeNull()
  })

  it('refuses a relative URL rather than resolving it against the panel', () => {
    /*
     * `/admin/settings` would otherwise resolve against this app's own origin
     * and hand an operator a link that looks like an attachment and navigates
     * into the panel.
     */
    expect(safeAttachmentHref('/admin/settings')).toBeNull()
    expect(safeAttachmentHref('../../etc/passwd')).toBeNull()
  })

  it('refuses a protocol-relative URL', () => {
    expect(safeAttachmentHref('//evil.example.com/a.png')).toBeNull()
  })

  it('refuses an empty or whitespace value', () => {
    expect(safeAttachmentHref('')).toBeNull()
    expect(safeAttachmentHref('   ')).toBeNull()
  })

  it('accepts an https URL and returns the PARSED href', () => {
    /*
     * The parsed form, not the raw input: what is returned must be exactly what
     * the browser would navigate to, or the two could disagree about escapes.
     */
    expect(safeAttachmentHref('https://media.callschat.com/a%20b.png')).toBe(
      'https://media.callschat.com/a%20b.png',
    )
  })

  it('accepts an https URL on any host', () => {
    /*
     * Deliberately not host-restricted. The documented host
     * (`storage.callschat.com`) does not resolve in DNS, and uploaded logos
     * land on `media.callschat.com`, so the panel does not know where a
     * legitimate attachment lives. A wrong allowlist would hide real files;
     * the scheme check is what stops the dangerous case.
     */
    expect(safeAttachmentHref('https://cdn.example.com/x.png')).toBe(
      'https://cdn.example.com/x.png',
    )
  })
})

describe('isSafeAttachment', () => {
  const base = {
    id: 'att_1',
    feedbackId: 'fb_1',
    fileName: 'a.png',
    fileType: 'image/png',
    fileSize: 10,
    createdAt: '2026-09-06T00:00:00.000Z',
  }

  it('is false for the hostile payload and true for a real file', () => {
    expect(
      isSafeAttachment({ ...base, fileUrl: 'javascript:alert(document.domain)' }),
    ).toBe(false)
    expect(
      isSafeAttachment({ ...base, fileUrl: 'https://media.callschat.com/a.png' }),
    ).toBe(true)
  })
})

describe('attachmentKind', () => {
  it.each([
    ['image/png', 'image'],
    ['IMAGE/JPEG', 'image'],
    ['video/mp4', 'video'],
    ['audio/mpeg', 'audio'],
    ['application/pdf', 'document'],
    ['text/plain', 'document'],
    ['', 'unknown'],
    ['not-a-mime', 'unknown'],
  ])('maps %s to %s', (fileType, expected) => {
    expect(attachmentKind(fileType)).toBe(expected)
  })

  it('never influences whether a file can be opened', () => {
    /*
     * `fileType` is a string a stranger wrote. It picks a decorative glyph and
     * nothing else — claiming `image/png` must not make a `javascript:` URL
     * openable, and claiming `text/html` must not close a legitimate one.
     */
    expect(safeAttachmentHref('javascript:alert(1)')).toBeNull()
    expect(attachmentKind('image/png')).toBe('image')
    expect(safeAttachmentHref('https://media.callschat.com/a.png')).not.toBeNull()
    expect(attachmentKind('text/html')).toBe('document')
  })
})
