// Compatibility-only no-ops. Pawzzle deliberately never generates a clock-out
// timestamp. Open sessions remain incomplete until an employee clocks out or
// an authorized attendance correction is committed.
const configuredMaximum = () => null;
const processStoreAutoClockOuts = async () => 0;
const processAttendanceAutoClockOuts = async () => 0;

module.exports = {
  configuredMaximum,
  processStoreAutoClockOuts,
  processAttendanceAutoClockOuts
};
