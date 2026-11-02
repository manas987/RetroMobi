import { inflateRawSync } from "node:zlib";

/**
 * Reads one named entry out of a ZIP archive.
 *
 * DigiLocker's signed XML arrives as `xml_file`: a link to a **zip** containing
 * the XML. That is the only zip this system ever opens, so this is 40 lines
 * rather than a dependency.
 *
 * ponytail: handles stored (0) and deflate (8) entries in a non-zip64,
 * unencrypted archive by walking local file headers. If DigiLocker ever ships
 * zip64, encryption or a data descriptor without sizes, swap in `fflate` --
 * this throws rather than guessing.
 */
export class ZipError extends Error {}

const LOCAL_HEADER = 0x04034b50;

export function readZipEntries(buffer: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const entries = new Map<string, Uint8Array>();
  let offset = 0;

  while (offset + 30 <= buffer.byteLength) {
    if (view.getUint32(offset, true) !== LOCAL_HEADER) break;

    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;

    if (flags & 0x1) throw new ZipError("encrypted zip entries are not supported");
    // Bit 3 means the sizes live in a trailing data descriptor, so the entry
    // cannot be read by walking headers. Refuse rather than mis-slice it.
    if (flags & 0x8) throw new ZipError("zip entry has no size in its local header");

    const name = new TextDecoder().decode(buffer.subarray(nameStart, nameStart + nameLength));
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) entries.set(name, compressed);
    else if (method === 8) entries.set(name, new Uint8Array(inflateRawSync(compressed)));
    else throw new ZipError(`unsupported zip compression method ${method}`);

    offset = dataStart + compressedSize;
  }

  if (entries.size === 0) throw new ZipError("no readable entries in zip");
  return entries;
}

/** The first entry whose name ends with `.xml`, case-insensitively. */
export function readXmlFromZip(buffer: Uint8Array): string {
  const entries = readZipEntries(buffer);
  for (const [name, bytes] of entries) {
    if (name.toLowerCase().endsWith(".xml")) return new TextDecoder().decode(bytes);
  }
  throw new ZipError(`zip contains no .xml entry (found: ${[...entries.keys()].join(", ")})`);
}
