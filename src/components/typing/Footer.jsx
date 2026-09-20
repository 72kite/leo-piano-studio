import './Footer.css';
export function Footer() {
  return (
    <footer className="app-footer" role="contentinfo">
      <div className="footer-left">
        <span>github</span>
        <span>discord</span>
        <span>v3.0.0</span>
      </div>
      <div className="footer-center">
        <span>tab → restart</span>
        <span className="fdot">·</span>
        <span>esc → settings</span>
      </div>
      <div className="footer-right">
        <span>en</span>
        <span className="fdot">·</span>
        <span id="footer-theme">dark</span>
      </div>
    </footer>
  );
}
