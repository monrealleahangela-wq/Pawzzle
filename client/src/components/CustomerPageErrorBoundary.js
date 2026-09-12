import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft, RotateCcw } from 'lucide-react';

class CustomerPageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error(`Customer page render failed: ${this.props.pageName || 'unknown page'}`, error, errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <section className="mx-auto flex min-h-[55vh] max-w-lg items-center px-4 py-10">
        <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary-50 text-primary-700 dark:bg-primary-950/50 dark:text-primary-300">
            <AlertCircle className="h-6 w-6" />
          </span>
          <h1 className="mt-4 text-xl font-black text-slate-900 dark:text-slate-100">
            {this.props.title || 'Unable to show this page'}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {this.props.message || 'Something in this record could not be displayed. Please try again.'}
          </p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => window.location.reload()} className="btn btn-primary inline-flex items-center justify-center gap-2">
              <RotateCcw className="h-4 w-4" /> Retry
            </button>
            <Link to={this.props.backTo || '/home'} className="btn btn-outline inline-flex items-center justify-center gap-2">
              <ArrowLeft className="h-4 w-4" /> {this.props.backLabel || 'Go back'}
            </Link>
          </div>
        </div>
      </section>
    );
  }
}

export default CustomerPageErrorBoundary;
