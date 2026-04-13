import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error", error, errorInfo);
        this.setState({ errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-4 bg-red-100 text-red-900 h-screen overflow-auto">
                    <h1 className="text-xl font-bold mb-2">Something went wrong.</h1>
                    <p className="font-mono text-xs mb-4">{this.state.error && this.state.error.toString()}</p>
                    <details className="whitespace-pre-wrap text-xs">
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </details>
                    <button
                        className="mt-4 bg-red-600 text-white px-4 py-2 rounded"
                        onClick={() => window.location.href = '/'}
                    >
                        Go Home
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
