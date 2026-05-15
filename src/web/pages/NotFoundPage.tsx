import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="empty-state">
      <h2>Diagram not found</h2>
      <p>This diagram id doesn't exist in the current analysis.</p>
      <Link to="/"><button className="primary">Go home</button></Link>
    </div>
  );
}
