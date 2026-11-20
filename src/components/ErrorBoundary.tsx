import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'حدث خطأ غير متوقع' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-[#0b0d10] text-gray-100 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-[#12161d] border border-red-500/30 rounded-xl p-6 text-center space-y-4">
            <h2 className="text-xl font-bold text-red-400">تعذر إكمال العملية</h2>
            <p className="text-sm text-gray-300 break-words">{this.state.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded-lg transition-colors"
            >
              إعادة تحميل اللعبة
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
