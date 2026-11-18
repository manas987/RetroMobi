// The suites were written against the online licence gate, which stays in the
// code for after the beta. Declaration-mode tests (the beta default) delete
// this flag for themselves -- see "licence declaration" in bookingsService.test.ts.
process.env.ONLINE_LICENCE_CHECK ??= "true";
