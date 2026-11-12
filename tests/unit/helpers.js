// Shared helpers for the Node unit tests.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));

/** The five Rev D drawings, relative to tests/fixtures/. FUME_SVGS[3] is SFE-04. */
export const FUME_SVGS = [
  'fume-extractor/docs/schematics/SFE-01_Schematic.svg',
  'fume-extractor/docs/schematics/SFE-02_Reference.svg',
  'fume-extractor/docs/schematics/SFE-03_USB_Port.svg',
  'fume-extractor/docs/layout/SFE-04_Perfboard_Layout.svg',
  'fume-extractor/docs/layout/SFE-D1_Pot_Detail.svg',
];

/** An XML parser for Node that throws on errors, like a browser's parsererror. */
export function nodeParser() {
  return new DOMParser({
    onError(level, message) {
      if (level !== 'warning') throw new Error(`${level}: ${message}`);
    },
  });
}

export function serialize(doc) {
  return new XMLSerializer().serializeToString(doc);
}

export function readFixture(relPath) {
  return readFileSync(FIXTURES + relPath, 'utf8');
}

/** "fume-extractor/docs/layout/SFE-04_Perfboard_Layout.svg" → "SFE-04_Perfboard_Layout" */
export function sheetIdOf(relPath) {
  return relPath.split('/').pop().replace(/\.svg$/i, '');
}
