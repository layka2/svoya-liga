// Manually authored visual interpretation of the supplied references.
// These are sculpt parameters, not inferred biometric measurements.
export const APPEARANCE={
 laika:{width:.096,height:.153,jaw:.76,chin:.51,cheek:.006,nose:.034,noseWidth:.013,noseY:-.022,eyeGap:.043,eyeY:.024,eyeWidth:.027,eyeHeight:.009,iris:0x899783,mouth:.030,lip:.004,smile:.007,open:.007,ears:1,build:.96,shoulders:1.03,hair:'waves',hairColor:0x241b1b,skin:0xd6aa92,brow:.0035,neck:.062,seed:11},
 kempil:{width:.098,height:.147,jaw:.72,chin:.56,cheek:.007,nose:.025,noseWidth:.014,noseY:-.023,eyeGap:.042,eyeY:.019,eyeWidth:.025,eyeHeight:.008,iris:0x49382d,mouth:.023,lip:.005,smile:0,open:0,ears:1.17,build:1.02,shoulders:1.03,hair:'fringe',hairColor:0x221c18,skin:0xd1a38c,brow:.0038,neck:.064,seed:22},
 aziom:{width:.113,height:.144,jaw:.91,chin:.77,cheek:.012,nose:.021,noseWidth:.016,noseY:-.025,eyeGap:.044,eyeY:.022,eyeWidth:.024,eyeHeight:.0075,iris:0x4e4032,mouth:.026,lip:.005,smile:-.001,open:0,ears:1.05,build:1.22,shoulders:1.06,hair:'swept',hairColor:0x392e22,skin:0xd2b39b,brow:.0027,neck:.078,seed:33},
 demidok:{width:.095,height:.147,jaw:.90,chin:.61,cheek:.004,nose:.030,noseWidth:.012,noseY:-.019,eyeGap:.042,eyeY:.025,eyeWidth:.026,eyeHeight:.0075,iris:0x6c8081,mouth:.024,lip:.0035,smile:-.0005,open:0,ears:1.1,build:.98,shoulders:1.05,hair:'crop',hairColor:0x968051,skin:0xdab19b,brow:.0034,neck:.063,seed:44},
 gabar:{width:.092,height:.153,jaw:.70,chin:.49,cheek:.004,nose:.029,noseWidth:.011,noseY:-.023,eyeGap:.040,eyeY:.022,eyeWidth:.025,eyeHeight:.0085,iris:0x698890,mouth:.024,lip:.004,smile:.003,open:0,ears:1.17,build:.90,shoulders:.98,hair:'wisps',hairColor:0x655039,skin:0xdcaf95,brow:.003,neck:.058,seed:77},
 piniv:{width:.104,height:.145,jaw:.82,chin:.65,cheek:.009,nose:.025,noseWidth:.014,noseY:-.021,eyeGap:.044,eyeY:.025,eyeWidth:.026,eyeHeight:.009,iris:0x708c97,mouth:.025,lip:.0045,smile:.0005,open:0,ears:.98,build:1.04,shoulders:1.0,hair:'tousled',hairColor:0x6b563e,skin:0xd7ac97,brow:.0037,neck:.067,seed:66},
 askar:{width:.091,height:.151,jaw:.68,chin:.51,cheek:.003,nose:.036,noseWidth:.013,noseY:-.024,eyeGap:.040,eyeY:.026,eyeWidth:.027,eyeHeight:.0105,iris:0x34291f,mouth:.025,lip:.0045,smile:.002,open:0,ears:1.1,build:.88,shoulders:.95,hair:'spikes',hairColor:0x403123,skin:0xcdaa8c,brow:.004,neck:.057,seed:55}
};

// Separate, fictional school players; no reused photo faces.
APPEARANCE.mate={...APPEARANCE.gabar,width:.102,height:.150,jaw:.86,chin:.67,build:1.02,shoulders:1.03,hair:'crop',hairColor:0x302923,skin:0xc79a7e,iris:0x514639,smile:0,seed:108};
APPEARANCE.guest={...APPEARANCE.kempil,width:.096,height:.15,jaw:.78,build:.97,hair:'swept',hairColor:0x796349,skin:0xd6b198,iris:0x688075,seed:109};
