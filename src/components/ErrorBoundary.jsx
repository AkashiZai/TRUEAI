import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: '#f6f7f4',
            color: '#111c17',
            fontFamily: '"IBM Plex Sans Thai", sans-serif',
          }}
        >
          <div
            style={{
              maxWidth: 440,
              background: '#ffffff',
              border: '1px solid #d4ded8',
              borderRadius: 12,
              padding: 24,
              textAlign: 'center',
            }}
          >
            <h2 style={{ margin: '0 0 8px', fontSize: 18 }}>เกิดข้อผิดพลาดในการแสดงผล</h2>
            <p style={{ margin: '0 0 16px', fontSize: 13.5, color: '#4a5d54' }}>
              ระบบตรวจพบข้อมูลผิดรูปแบบและหยุดการเรนเดอร์เพื่อความปลอดภัย กรุณารีโหลดหน้าใหม่
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                border: 'none',
                background: '#0f5132',
                color: '#ffffff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              รีโหลด GreenRoute AI
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
