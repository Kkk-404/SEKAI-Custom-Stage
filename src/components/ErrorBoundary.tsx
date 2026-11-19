import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Непредвиденная ошибка интерфейса',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('SEKAI Custom Stage error:', error, info);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen w-full flex items-center justify-center p-5 bg-[#0f172a] text-white">
        <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-cyan-400/40 p-6 shadow-2xl text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-[#39C5BB] to-[#ff4f93] flex items-center justify-center text-2xl font-black shadow-lg">
            01
          </div>
          <div>
            <h1 className="text-xl font-black">Что-то пошло не так</h1>
            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
              Сцена столкнулась со сбоем (например, повреждённый чарт или медиафайл). Ваши песни и
              рекорды сохранены.
            </p>
            {this.state.message && (
              <p className="mt-2 px-3 py-1.5 rounded-xl bg-black/35 text-[11px] font-mono text-rose-300 break-words">
                {this.state.message}
              </p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-[#39C5BB] to-[#0ea5e9] text-slate-950 font-black text-xs hover:brightness-110 transition"
            >
              Перезагрузить сцену
            </button>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
              }}
              className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold transition"
            >
              Вернуться
            </button>
          </div>
        </div>
      </div>
    );
  }
}
