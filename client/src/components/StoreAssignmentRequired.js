import React from 'react';
import { Store, AlertCircle, ArrowRight } from 'lucide-react';

const StoreAssignmentRequired = ({ onRefresh }) => {
  return (
    <div className="max-w-2xl mx-auto mt-12">
      <div className="card p-8 text-center">
        <div className="w-20 h-20 bg-secondary-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Store className="h-10 w-10 text-primary-600" />
        </div>
        
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Store Assignment Required
        </h2>
        
        <div className="bg-secondary-50 border border-secondary-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-primary-600 mt-0.5 flex-shrink-0" />
            <div className="text-left">
              <p className="text-primary-800 font-medium mb-1">
                You need to be assigned to a store to manage:
              </p>
              <ul className="text-primary-700 text-sm space-y-1 list-disc list-inside">
                <li>Services</li>
                <li>Bookings</li>
                <li>Purchase History</li>
                <li>Products and Inventory</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="space-y-4 text-gray-600 text-sm mb-8">
          <p>
            As an admin, you need to be associated with a store to manage store-specific content. 
            Please contact a super admin to assign you to a store.
          </p>
          <p className="text-xs text-gray-500">
            If you were recently assigned to a store, try refreshing your session to update your permissions.
          </p>
        </div>

        <div className="flex gap-4 justify-center">
          <button
            onClick={onRefresh}
            className="btn btn-primary flex items-center gap-2"
          >
            Refresh Session
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="btn btn-outline"
          >
            Go to Profile
          </button>
        </div>
      </div>
    </div>
  );
};

export default StoreAssignmentRequired;
