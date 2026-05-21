import { Icon } from '../components/Icon';
import { TopBar } from '../components/ui';

interface PlaceholderProps {
  title: string;
  crumbs: string[];
  description: string;
  endpointHint?: string;
}

export function Placeholder({ title, crumbs, description, endpointHint }: PlaceholderProps) {
  return (
    <>
      <TopBar title={title} crumbs={crumbs} />
      <div className="content">
        <div className="card" style={{ padding: 0 }}>
          <div className="empty">
            <div className="icon-wrap">
              <Icon name="inbox" size={26} />
            </div>
            <h4>Écran en préparation</h4>
            <p>{description}</p>
            {endpointHint && (
              <p
                className="mono"
                style={{
                  marginTop: 8,
                  color: 'var(--ink-500)',
                  fontSize: 11.5,
                }}
              >
                {endpointHint}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
