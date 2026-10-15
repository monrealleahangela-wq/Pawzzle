import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import notificationService from '../services/notificationService';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';
import NotificationEntry from '../components/NotificationEntry';

const Notifications = () => {
    const { user } = useAuth();
    const userId = String(user?._id || user?.id || '');
    const { revision, error: actionError, markAsRead, markAllRead, deleteNotification } = useNotifications();
    const [page, setPage] = useState(1);
    const [rows, setRows] = useState([]);
    const [pagination, setPagination] = useState({ totalPages: 1 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [retry, setRetry] = useState(0);
    const requestNumber = useRef(0);

    useEffect(() => {
        const request = ++requestNumber.current;
        setLoading(true);
        setError(null);
        notificationService.getNotifications({ page, limit: 20 }).then(response => {
            if (request !== requestNumber.current) return;
            setRows(response.data.notifications || []);
            setPagination(response.data.pagination || { totalPages: 1 });
        }).catch(() => {
            if (request === requestNumber.current) setError('Unable to load notifications.');
        }).finally(() => {
            if (request === requestNumber.current) setLoading(false);
        });
        return () => { requestNumber.current += 1; };
    }, [userId, page, revision, retry]);

    return <section className="mx-auto w-full max-w-3xl rounded-2xl bg-white shadow-sm dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-6">
            <div className="flex items-center gap-2"><Bell size={22} aria-hidden="true" /><h1 className="mb-0 text-xl font-bold">All Notifications</h1></div>
            <button type="button" onClick={markAllRead} className="text-sm font-semibold text-primary-600 hover:underline">Mark all as read</button>
        </div>
        {actionError && <p role="alert" className="p-4 text-sm text-red-700">{actionError}</p>}
        {loading ? <p role="status" className="p-6">Loading notifications…</p>
            : error ? <div role="alert" className="p-6">{error} <button type="button" onClick={() => setRetry(value => value + 1)} className="text-primary-600 underline">Retry</button></div>
                : rows.length === 0 ? <p className="p-6 text-center">No notifications to show.</p>
                    : <div>{rows.map(notification => <NotificationEntry key={notification._id} notification={notification} onRead={markAsRead} onDelete={deleteNotification} />)}</div>}
        {pagination.totalPages > 1 && <nav aria-label="Notification pages" className="flex items-center justify-between border-t p-4">
            <button type="button" disabled={page === 1 || loading} onClick={() => setPage(value => value - 1)} className="disabled:opacity-40">Previous</button>
            <span>Page {page} of {pagination.totalPages}</span>
            <button type="button" disabled={page >= pagination.totalPages || loading} onClick={() => setPage(value => value + 1)} className="disabled:opacity-40">Next</button>
        </nav>}
    </section>;
};

export default Notifications;
