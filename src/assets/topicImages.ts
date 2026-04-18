// Tiny pixel-art topic glyphs for the image container on the G2 display.
//
// G2 renders 4-bit greyscale; the SDK's updateImageRawData accepts an
// 8-bit-grey byte stream and downsamples internally (that's what
// imageToGray4Failed suggests). We hand-author 40x40 icons as ASCII and
// pack them row-major into a single Uint8Array per topic.
//
// Images are GATED behind a localStorage flag (`dk:images=1`) so that
// a renderer issue on real hardware can't break the demo — the text-only
// path keeps working when images are off.

import type { Topic } from '../cards';

export const IMAGE_CONTAINER_ID = 2;
export const IMAGE_CONTAINER_NAME = 'icon';
export const IMAGE_W = 40;
export const IMAGE_H = 40;

// Three intensities map to roughly the four 4-bit bands after SDK downsample.
const BG = 0;
const DIM = 120;
const LIT = 255;

// Each icon is 40 rows × 40 cols = 1600 bytes. ' ' off, '.' dim, '#' lit.
const ART: Record<Topic, string[]> = {
  space: [
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                 ####                   ',
    '              ##########                ',
    '            ##############              ',
    '          #################             ',
    '         ##########  #######            ',
    '        ########      ######            ',
    '       #######         ######           ',
    '      #######           ######          ',
    '      ######             #####          ',
    '     ######              ######         ',
    '     ######              ######         ',
    '     ######              ######         ',
    '     ######              ######         ',
    '     ######              ######         ',
    '     ######              ######         ',
    '     ######              ######         ',
    '     ######              ######         ',
    '      ######             #####          ',
    '      ######             #####          ',
    '       #######         ######           ',
    '        ########      ######            ',
    '         ##########  #######            ',
    '          #################             ',
    '            ##############              ',
    '              ##########                ',
    '                 ####                   ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
  ],
  nature: [
    '                                        ',
    '                                        ',
    '                                        ',
    '                  ##                    ',
    '                 ####                   ',
    '                 ####                   ',
    '                ######                  ',
    '               ########                 ',
    '              ##########                ',
    '             ############               ',
    '            ##############              ',
    '           ################             ',
    '          ##################            ',
    '         ####################           ',
    '        ######################          ',
    '       ######### ##  ##########         ',
    '      ##########  #  ###########        ',
    '      ##########  #  ###########        ',
    '       ##########    ##########         ',
    '        #########   ##########          ',
    '         ########   #########           ',
    '          #######   ########            ',
    '           ######   #######             ',
    '            #####   ######              ',
    '             ####   #####               ',
    '              ###   ####                ',
    '               ##   ###                 ',
    '                #   ##                  ',
    '                    #                   ',
    '                    #                   ',
    '                    #                   ',
    '                    #                   ',
    '                    #                   ',
    '                    #                   ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
  ],
  body: [
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '        ######          ######          ',
    '      ##########      ##########        ',
    '     ############    ############       ',
    '    #############  #############        ',
    '   ################################     ',
    '   ################################     ',
    '   ################################     ',
    '   ################################     ',
    '   ################################     ',
    '   ################################     ',
    '    ##############################      ',
    '     ############################       ',
    '      ##########################        ',
    '       ########################         ',
    '        ######################          ',
    '         ####################           ',
    '          ##################            ',
    '           ################             ',
    '            ##############              ',
    '             ############               ',
    '              ##########                ',
    '               ########                 ',
    '                ######                  ',
    '                 ####                   ',
    '                  ##                    ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
  ],
  animals: [
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '         ####                ####       ',
    '        ######              ######      ',
    '       ########            ########     ',
    '       ########            ########     ',
    '        ######              ######      ',
    '         ####                ####       ',
    '                                        ',
    '              ################          ',
    '            ####################        ',
    '          ########################      ',
    '         ##########################     ',
    '        ############################    ',
    '        ############################    ',
    '        ############################    ',
    '         ##########################     ',
    '          ########################      ',
    '            ####################        ',
    '              ################          ',
    '                                        ',
    '                                        ',
    '         ####      ####      ####       ',
    '        ######    ######    ######      ',
    '        ######    ######    ######      ',
    '         ####      ####      ####       ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
  ],
  everyday: [
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '       ############################     ',
    '       ############################     ',
    '       ##                        ##     ',
    '       ##                        ##     ',
    '       ##    ########## ######   ##     ',
    '       ##    ##########          ##     ',
    '       ##                        ##     ',
    '       ##                        ##     ',
    '       ##  ##################### ##     ',
    '       ##  ##################### ##     ',
    '       ##                        ##     ',
    '       ##                        ##     ',
    '       ##  ########################     ',
    '       ##  ########################     ',
    '       ##                        ##     ',
    '       ##                        ##     ',
    '       ##  ########################     ',
    '       ##  ########################     ',
    '       ##                        ##     ',
    '       ##                        ##     ',
    '       ############################     ',
    '       ############################     ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
  ],
};

function pack(rows: string[]): number[] {
  const bytes: number[] = [];
  for (const row of rows) {
    // Normalize row to exactly IMAGE_W columns.
    const padded = row.length < IMAGE_W ? row + ' '.repeat(IMAGE_W - row.length) : row.slice(0, IMAGE_W);
    for (const ch of padded) {
      bytes.push(ch === '#' ? LIT : ch === '.' ? DIM : BG);
    }
  }
  return bytes;
}

export const TOPIC_IMAGE: Record<Topic, number[]> = {
  space: pack(ART.space),
  nature: pack(ART.nature),
  body: pack(ART.body),
  animals: pack(ART.animals),
  everyday: pack(ART.everyday),
};

// Opt-in via localStorage so a hardware rendering issue never breaks the
// text-only path. Toggle from the phone UI or devtools console.
export function imagesEnabled(): boolean {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('dk:images') === '1';
  } catch {
    return false;
  }
}

export function setImagesEnabled(on: boolean): void {
  try {
    localStorage.setItem('dk:images', on ? '1' : '0');
  } catch {
    /* noop */
  }
}

// Build an ImageContainerProperty instance that the SDK will accept inside
// CreateStartUpPageContainer.imageObject. Placed in the top-left corner so
// the text container gets the majority of the 576x288 canvas.
export function imageContainer(): unknown {
  const base = {
    xPosition: 4,
    yPosition: 4,
    width: IMAGE_W,
    height: IMAGE_H,
    borderWidth: 0,
    borderColor: 5,
    borderRadius: 0,
    paddingLength: 0,
    containerID: IMAGE_CONTAINER_ID,
    containerName: IMAGE_CONTAINER_NAME,
    isEventCapture: 0,
  };
  const sdk = (window as any).__evenSdkCache;
  if (sdk?.ImageContainerProperty) return new sdk.ImageContainerProperty(base);
  return base;
}
