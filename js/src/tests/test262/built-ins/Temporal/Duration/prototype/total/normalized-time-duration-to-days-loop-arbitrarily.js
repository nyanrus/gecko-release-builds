// |reftest| skip-if(!this.hasOwnProperty('Temporal')) -- Temporal is not enabled unconditionally
// Copyright (C) 2022 Igalia, S.L. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-temporal.duration.prototype.total
description: >
  NormalizedTimeDurationToDays should not be able to loop arbitrarily.
info: |
  NormalizedTimeDurationToDays ( norm, zonedRelativeTo, timeZoneRec [ , precalculatedPlainDatetime ] )
  ...
  22. If NormalizedTimeDurationSign(_oneDayLess_) × _sign_ ≥ 0, then
    a. Set _norm_ to _oneDayLess_.
    b. Set _relativeResult_ to _oneDayFarther_.
    c. Set _days_ to _days_ + _sign_.
    d. Set _oneDayFarther_ to ? AddDaysToZonedDateTime(_relativeResult_.[[Instant]], _relativeResult_.[[DateTime]], _timeZoneRec_, _zonedRelativeTo_.[[Calendar]], _sign_).
    e. Set dayLengthNs to NormalizedTimeDurationFromEpochNanosecondsDifference(_oneDayFarther.[[EpochNanoseconds]], relativeResult.[[EpochNanoseconds]]).
    f. If NormalizedTimeDurationSign(? SubtractNormalizedTimeDuration(_norm_, _dayLengthNs_)) × _sign_ ≥ 0, then
      i. Throw a *RangeError* exception.
features: [Temporal]
---*/

const duration = Temporal.Duration.from({ days: 1 });

const dayLengthNs = 86400000000000n;
const dayInstant = new Temporal.Instant(dayLengthNs);
let calls = 0;
const timeZone = new class extends Temporal.TimeZone {
  getPossibleInstantsFor() {
    calls++;
    return [dayInstant];
  }
}("UTC");

const relativeTo = new Temporal.ZonedDateTime(0n, timeZone);

assert.throws(RangeError, () => duration.total({ unit: "days", relativeTo }), "indefinite loop is prevented");
assert.sameValue(calls, 4, "getPossibleInstantsFor is not called indefinitely");
  // Expected calls:
  // AddZonedDateTime (1)
  // NormalizedTimeDurationToDays ->
  //   AddDaysToZonedDateTime (2, step 12)
  //   AddDaysToZonedDateTime (3, step 15)
  //   AddDaysToZonedDateTime (4, step 18.d)

reportCompare(0, 0);
