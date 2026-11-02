import { describe, expect, test } from "bun:test";
import { deflateRawSync } from "node:zlib";
import {
  DigilockerXmlError,
  parseDrivingLicenceXml,
  photoContentType,
  toIsoDate,
} from "./digilockerXml.ts";
import { ZipError, readXmlFromZip, readZipEntries } from "./zip.ts";

// Shaped on the v1.9 spec's own example: MCWG and LMV with issue and
// endorsement dates, a base64 photo with a mandatory format attribute.
const CERTIFICATE = `<?xml version="1.0" encoding="UTF-8"?>
<Certificate type="DRVLC" number="UK0720190001234" issueDate="01-07-2019" expiryDate="30-06-2039">
  <IssuedBy>
    <Organization name="RTO DEHRADUN" type="RTO"/>
  </IssuedBy>
  <IssuedTo>
    <Person name="ASHA DEVI" dob="15-06-1995" gender="F" swd="RAM DEVI">
      <Photo format="JPEG">
        aGVsbG8=
      </Photo>
      <Address type="permanent" line1="12 Rajpur Road" district="Dehradun"/>
    </Person>
  </IssuedTo>
  <CertificateData>
    <DrivingLicense>
      <Categories>
        <Category code="MCWG" abbreviation="M/CYCLE.WG" issueDate="01-07-2019" endorseDate="01-07-2019"/>
        <Category code="LMV" abbreviation="LMV" issueDate="05-08-2021" endorseDate="05-08-2021"/>
      </Categories>
    </DrivingLicense>
  </CertificateData>
</Certificate>`;

describe("parseDrivingLicenceXml", () => {
  const parsed = parseDrivingLicenceXml(CERTIFICATE);

  test("reads the certificate's own attributes", () => {
    expect(parsed.licenceNumber).toBe("UK0720190001234");
    expect(parsed.issueDate).toBe("2019-07-01");
    expect(parsed.expiryDate).toBe("2039-06-30");
  });

  test("reads the holder from Person, not from the issuer", () => {
    expect(parsed.holderName).toBe("ASHA DEVI");
    expect(parsed.dob).toBe("1995-06-15");
    expect(parsed.gender).toBe("F");
  });

  // <IssuedTo> can hold an Organization too, so the issuer has to be scoped.
  test("reads the issuing RTO from inside IssuedBy", () => {
    expect(parsed.issuingAuthority).toBe("RTO DEHRADUN");
  });

  test("reads the photo and its format, stripping the XML's whitespace", () => {
    expect(parsed.photoBase64).toBe("aGVsbG8=");
    expect(parsed.photoFormat).toBe("JPEG");
    expect(Buffer.from(parsed.photoBase64!, "base64").toString()).toBe("hello");
  });

  // These four attributes are driving_licence_categories' four columns.
  test("reads every category with its dates, as ISO", () => {
    expect(parsed.categories).toEqual([
      {
        code: "MCWG",
        abbreviation: "M/CYCLE.WG",
        issueDate: "2019-07-01",
        endorseDate: "2019-07-01",
      },
      { code: "LMV", abbreviation: "LMV", issueDate: "2021-08-05", endorseDate: "2021-08-05" },
    ]);
  });

  test("a namespaced document parses the same way", () => {
    const ns = CERTIFICATE.replace(/<(\/?)(\w+)/g, "<$1dl:$2").replace("<?xml", "<?xml");
    expect(parseDrivingLicenceXml(ns).licenceNumber).toBe("UK0720190001234");
  });

  test("a certificate with no number is refused, not half-parsed", () => {
    expect(() => parseDrivingLicenceXml(`<Certificate type="DRVLC"/>`)).toThrow(DigilockerXmlError);
  });

  test("a certificate with no photo parses, leaving the photo absent", () => {
    const noPhoto = CERTIFICATE.replace(/<Photo[\s\S]*?<\/Photo>/, "");
    expect(parseDrivingLicenceXml(noPhoto).photoBase64).toBeUndefined();
  });

  test("entities in attributes are decoded", () => {
    const amp = CERTIFICATE.replace("RTO DEHRADUN", "RTO DEHRADUN &amp; HARIDWAR");
    expect(parseDrivingLicenceXml(amp).issuingAuthority).toBe("RTO DEHRADUN & HARIDWAR");
  });
});

describe("toIsoDate", () => {
  test("accepts the DD-MM-YYYY and DD/MM/YYYY the certificates use", () => {
    expect(toIsoDate("01-07-2019")).toBe("2019-07-01");
    expect(toIsoDate("1/7/2019")).toBe("2019-07-01");
  });

  test("passes an already-ISO date through", () => {
    expect(toIsoDate("2019-07-01T00:00:00+05:30")).toBe("2019-07-01");
  });

  // Returning a half-parsed date would break every string comparison in
  // licenceEligibility, silently.
  test("anything it cannot read becomes undefined, not a guess", () => {
    expect(toIsoDate("July 2019")).toBeUndefined();
    expect(toIsoDate("")).toBeUndefined();
  });
});

describe("photoContentType", () => {
  test("maps the spec's four format values", () => {
    expect(photoContentType("PNG")).toBe("image/png");
    expect(photoContentType("JPG")).toBe("image/jpeg");
    expect(photoContentType("JPEG")).toBe("image/jpeg");
    expect(photoContentType("RAW")).toBe("application/octet-stream");
  });
});

describe("the zip reader", () => {
  function zip(name: string, contents: string, method: 0 | 8 = 8): Uint8Array {
    const nameBytes = Buffer.from(name);
    const raw = Buffer.from(contents);
    const body = method === 8 ? deflateRawSync(raw) : raw;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt32LE(0, 14);
    header.writeUInt32LE(body.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28);
    return new Uint8Array(Buffer.concat([header, nameBytes, body]));
  }

  test("reads a deflated entry", () => {
    expect(readXmlFromZip(zip("DRVLC.xml", CERTIFICATE))).toBe(CERTIFICATE);
  });

  test("reads a stored entry", () => {
    expect(readXmlFromZip(zip("DRVLC.xml", CERTIFICATE, 0))).toBe(CERTIFICATE);
  });

  test("finds the xml among several entries", () => {
    const combined = new Uint8Array([...zip("readme.txt", "hi", 0), ...zip("dl.XML", "<a/>", 0)]);
    expect(readZipEntries(combined).size).toBe(2);
    expect(readXmlFromZip(combined)).toBe("<a/>");
  });

  test("a zip with no xml is an error naming what it did contain", () => {
    expect(() => readXmlFromZip(zip("readme.txt", "hi", 0))).toThrow(/readme\.txt/);
  });

  test("something that is not a zip is refused rather than mis-sliced", () => {
    expect(() => readZipEntries(new Uint8Array(Buffer.from("not a zip at all")))).toThrow(ZipError);
  });
});
