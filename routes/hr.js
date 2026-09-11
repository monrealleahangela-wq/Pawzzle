const express = require('express');
const { authenticate, requirePermission } = require('../middleware/auth');
const hr = require('../controllers/hrController');

const router = express.Router();
router.use(authenticate);

// Employee self-service. Controllers enforce that the caller is an active,
// assigned Store employee and never accept an employee ID from the client.
router.get('/me/attendance', hr.myAttendance);
router.post('/me/attendance/time-in', hr.timeIn);
router.post('/me/attendance/time-out', hr.timeOut);
router.get('/me/leaves', hr.myLeaves);
router.post('/me/leaves', hr.createLeave);
router.patch('/me/leaves/:id/cancel', hr.cancelLeave);
router.get('/me/payslips', hr.myPayslips);
router.get('/me/payslips/:id', hr.myPayslip);

router.get('/settings', requirePermission('attendance.view', 'attendance.manage', 'leave.view', 'leave.approve', 'payroll.view', 'payroll.prepare', 'payroll.manage', 'compensation.manage'), hr.getSettings);
router.put('/settings', requirePermission('payroll.configure', 'payroll.manage'), hr.updateSettings);
router.get('/employees', requirePermission('attendance.view', 'attendance.manage', 'leave.view', 'leave.approve', 'payroll.view', 'payroll.prepare', 'payroll.manage', 'compensation.manage'), hr.listEmployees);
router.get('/employees/:employeeId/compensation', requirePermission('compensation.manage'), hr.getCompensation);
router.put('/employees/:employeeId/compensation', requirePermission('compensation.manage'), hr.updateCompensation);

router.get('/attendance', requirePermission('attendance.view', 'attendance.manage'), hr.managementAttendance);
router.post('/attendance/manual', requirePermission('attendance.manage'), hr.createManualAttendance);
router.patch('/attendance/:id/correct', requirePermission('attendance.manage'), hr.correctAttendance);
router.get('/leaves', requirePermission('leave.view', 'leave.approve'), hr.listLeaves);
router.patch('/leaves/:id/review', requirePermission('leave.approve'), hr.reviewLeave);

router.get('/payroll', requirePermission('payroll.view', 'payroll.prepare', 'payroll.manage'), hr.listPeriods);
router.post('/payroll', requirePermission('payroll.prepare', 'payroll.manage'), hr.generatePeriod);
router.get('/payroll/:id', requirePermission('payroll.view', 'payroll.prepare', 'payroll.manage'), hr.periodDetails);
router.post('/payroll/:id/compute', requirePermission('payroll.prepare', 'payroll.manage'), hr.computePeriod);
router.post('/payslips/:payslipId/adjustments', requirePermission('payroll.prepare', 'payroll.manage'), hr.addAdjustment);
router.patch('/payroll/:id/review', requirePermission('payroll.review', 'payroll.manage'), hr.reviewPeriod);
router.patch('/payroll/:id/approve', requirePermission('payroll.approve', 'payroll.manage'), hr.approvePeriod);
router.patch('/payroll/:id/pay', requirePermission('payroll.pay', 'payroll.manage'), hr.payPeriod);

module.exports = router;
