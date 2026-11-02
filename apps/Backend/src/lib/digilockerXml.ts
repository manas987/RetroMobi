/**
 * Parses a DigiLocker issued Driving Licence certificate (doc type `DRVLC`).
 *
 * Format: *Digital Locker XML Certificate Formats v1.9*, May 2024
 * (https://cdn.apisetu.gov.in/portal/assets/Digital%20Locker%20XML%20Certificate%20Formats%20v1.9.pdf).
 * Everything is attributes, not text nodes, except `<Photo>`, which holds the
 * base64 image and carries a mandatory `format` attribute of RAW/PNG/JPG/JPEG.
 *
 * `<Category>`'s four attributes map one-to-one onto
 * `driving_licence_categories` -- that table was written from this spec.
 *
 * ponytail: attribute-regex parsing, not a real XML parser. The format is flat,
 * attribute-driven and government-fixed, and there is no XML dependency in this
 * repo. If a second XML document type ever appears, add one.
 *
 * NOTE ON THE SIGNATURE: this does NOT verify the document's XML-DSig. An
 * unverified signature means an unverified document, so the caller flags the
 * session for review rather than treating a parsed certificate as proven. See
 * docs/dl-verification-checklist.md -- it is a production blocker, not a
 * detail.
 */
export class DigilockerXmlError extends Error {}

export interface ParsedDrivingLicence {
  licenceNumber: string;
  holderName?: string;
  dob?: string;
  gender?: string;
  issueDate?: string;
  expiryDate?: string;
  issuingAuthority?: string;
  photoBase64?: string;
  photoFormat?: string;
  categories: Array<{
    code: string;
    abbreviation?: string;
    issueDate?: string;
    endorseDate?: string;
  }>;
}

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of tag.matchAll(/([A-Za-z_:][-\w:.]*)\s*=\s*"([^"]*)"/g)) {
    out[match[1]!] = decodeEntities(match[2]!);
  }
  return out;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** The opening tag of the first `name` element, or null. Namespace-agnostic. */
function openingTag(xml: string, name: string): string | null {
  const match = xml.match(new RegExp(`<(?:\\w+:)?${name}\\b[^>]*>`, "i"));
  return match ? match[0] : null;
}

function attributesOf(xml: string, name: string): Record<string, string> {
  const tag = openingTag(xml, name);
  return tag ? attributes(tag) : {};
}

/**
 * Dates in these certificates are typically DD-MM-YYYY or DD/MM/YYYY. Stored
 * as ISO, because every comparison in lib/licenceEligibility.ts is a string
 * comparison and a mixed format would silently compare wrong.
 */
export function toIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const match = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (!match) return undefined;
  const [, d, m, y] = match as unknown as [string, string, string, string];
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function parseDrivingLicenceXml(xml: string): ParsedDrivingLicence {
  const certificate = attributesOf(xml, "Certificate");
  const licenceNumber = certificate.number;
  if (!licenceNumber) {
    throw new DigilockerXmlError("certificate has no number attribute");
  }

  // The issuer is an <Organization> inside <IssuedBy>. Scoping to that block
  // matters: <IssuedTo> can contain an organisation too.
  const issuedBy = xml.match(/<(?:\w+:)?IssuedBy\b[^>]*>([\s\S]*?)<\/(?:\w+:)?IssuedBy>/i)?.[1];
  const person = attributesOf(xml, "Person");

  const photoTag = xml.match(
    /<(?:\w+:)?Photo\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?Photo>/i,
  );
  const photoAttributes = photoTag ? attributes(`<Photo${photoTag[1]}>`) : {};

  const categories: ParsedDrivingLicence["categories"] = [];
  for (const match of xml.matchAll(/<(?:\w+:)?Category\b[^>]*\/?>/gi)) {
    const attrs = attributes(match[0]);
    if (!attrs.code?.trim()) continue;
    categories.push({
      code: attrs.code.trim().toUpperCase(),
      abbreviation: attrs.abbreviation?.trim() || undefined,
      issueDate: toIsoDate(attrs.issueDate),
      endorseDate: toIsoDate(attrs.endorseDate),
    });
  }

  return {
    licenceNumber: licenceNumber.trim(),
    holderName: person.name?.trim() || undefined,
    dob: toIsoDate(person.dob),
    gender: person.gender?.trim() || undefined,
    issueDate: toIsoDate(certificate.issueDate),
    expiryDate: toIsoDate(certificate.expiryDate),
    issuingAuthority: issuedBy ? attributesOf(issuedBy, "Organization").name?.trim() : undefined,
    // Whitespace in base64 is legal in XML but not in atob/Buffer.from.
    photoBase64: photoTag ? photoTag[2]!.replace(/\s+/g, "") || undefined : undefined,
    photoFormat: photoAttributes.format?.trim().toUpperCase() || undefined,
    categories,
  };
}

/** `format` is RAW/PNG/JPG/JPEG per the spec; RAW has no useful media type. */
export function photoContentType(format: string | undefined): string {
  switch (format) {
    case "PNG":
      return "image/png";
    case "JPG":
    case "JPEG":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}
