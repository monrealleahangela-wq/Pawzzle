// Notification destinations are hints, never authorization. Protected routes
// and their APIs remain the source of truth for access to the referenced data.
export const notificationDestination = (notification, user) => {
    const target = notification?.targetUrl;
    const internalPath = typeof target === 'string' && target.startsWith('/') && !target.startsWith('//')
        && !target.includes('..') && !target.includes('\\')
        && !Array.from(target).some(character => character.charCodeAt(0) < 32);
    const id = String(notification?.relatedId || '');
    const validId = /^[a-f\d]{24}$/i.test(id);
    const operational = ['admin', 'store_owner', 'super_admin', 'platform_admin', 'staff', 'manager', 'delivery_rider'].includes(user?.role);

    // Order notifications must always open the portal that matches the
    // recipient. Older notices can contain a customer /orders target even
    // when they were sent to Store staff.
    if (notification?.relatedModel === 'Order') {
        if (!validId) return null;
        if (operational) return `/admin/orders/${id}`;
        if (user?.role === 'customer') return `/orders/${id}`;
        return null;
    }
    if (notification?.relatedModel === 'PetInquiry') {
        if (!internalPath) return null;
        if (target.startsWith('/admin/pet-inquiries')) return ['admin', 'store_owner', 'staff', 'manager'].includes(user?.role) ? target : null;
        if (target.startsWith('/pet-inquiries')) return user?.role === 'customer' ? target : null;
        return null;
    }
    if (internalPath) {
        if (target.startsWith('/superadmin/') && !['super_admin', 'platform_admin'].includes(user?.role)) return null;
        if (target.startsWith('/admin/') && !['admin', 'store_owner', 'super_admin', 'platform_admin', 'staff', 'manager'].includes(user?.role)) return null;
        return target;
    }
    if (notification?.relatedModel === 'StoreApplication' || notification?.type === 'store_application') {
        return ['super_admin', 'platform_admin'].includes(user?.role) ? '/superadmin/store-applications' : '/account-upgrade';
    }
    if (notification?.type === 'new_follow') return '/profile?tab=followers';
    if (!validId) return null;
    if (notification.relatedModel === 'OrderReturn') return `/returns/${id}`;
    if (notification.relatedModel === 'Booking') return operational ? `/admin/bookings?id=${id}` : `/bookings?id=${id}`;
    if (notification.type === 'chat_message' || notification.relatedModel === 'Conversation') {
        return operational ? `/admin/chat?conversationId=${id}` : `/messages/${id}`;
    }
    if (notification.relatedModel === 'Report' && ['super_admin', 'platform_admin'].includes(user?.role)) return '/superadmin/reports';
    if (notification.relatedModel === 'User' && ['super_admin', 'platform_admin'].includes(user?.role)) {
        return `/superadmin/account-management?search=${id}`;
    }
    return null;
};
