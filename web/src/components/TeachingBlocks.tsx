import type { CSSProperties } from 'react';
import type { TeachingBlock, TeachingRun } from '../services/assemblyApi';

// ---------------------------------------------------------------------------------------------
//  Texte structuré d'un chapitre — D-FIN-13 (JP 06/11, contrat §3.1) : sous-titres, paragraphes,
//  versets avec référence, listes. Texte brut : aucun HTML interprété, le gras et l'italique
//  viennent des `runs`. Chaque bloc porte `data-block-index` : c'est lui que suit la position de
//  lecture (`pages/TeachingChapter.tsx`). Tailles proportionnelles à `fontSize` (maquette, écran 4).
// ---------------------------------------------------------------------------------------------

/**
 * Dégagement sous la barre de lecture collante, quand on revient à un bloc. Reste DANS la bande que suit
 * la position (`rootMargin` de `pages/TeachingChapter.tsx`) : rouvrir un chapitre ne fait pas avancer sa position.
 */
const SCROLL_MARGIN = 125;

function Runs({ runs }: { runs: TeachingRun[] | null | undefined }) {
  return (
    <>
      {(runs ?? []).map((r, i) => {
        let node = <>{r.text}</>;
        if (r.italic) node = <em>{node}</em>;
        if (r.bold) node = <strong style={{ fontWeight: 600 }}>{node}</strong>;
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

function Block({ block, index, fontSize }: { block: TeachingBlock; index: number; fontSize: number }) {
  const common = { 'data-block-index': index } as const;
  const lh = Math.round(fontSize * 1.56);
  const para: CSSProperties = { margin: 0, fontSize, lineHeight: `${lh}px`, whiteSpace: 'pre-wrap', scrollMarginTop: SCROLL_MARGIN };
  const heading: CSSProperties = { margin: '8px 0 0', fontFamily: 'var(--font-serif)', fontWeight: 500, color: 'var(--green-800)', scrollMarginTop: SCROLL_MARGIN };

  switch (block.type) {
    case 'h2':
      return (
        <h2 {...common} style={{ ...heading, fontSize: Math.round(fontSize * 1.32), lineHeight: 1.24 }}>
          <Runs runs={block.runs} />
        </h2>
      );
    case 'h3':
      return (
        <h3 {...common} style={{ ...heading, fontSize: Math.round(fontSize * 1.14), lineHeight: 1.28 }}>
          <Runs runs={block.runs} />
        </h3>
      );
    case 'verse':
      return (
        <blockquote
          {...common}
          style={{ margin: 0, padding: '14px 16px', borderRadius: 'var(--radius-lg)', background: 'var(--ivory)', fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: fontSize * 0.97, lineHeight: `${lh}px`, whiteSpace: 'pre-wrap', scrollMarginTop: SCROLL_MARGIN }}
        >
          <Runs runs={block.runs} />
          {block.reference && (
            <footer style={{ fontFamily: 'var(--font-sans)', fontStyle: 'normal', fontSize: Math.max(12, fontSize * 0.78), color: 'var(--ink-500)', marginTop: 7 }}>
              {block.reference}
            </footer>
          )}
        </blockquote>
      );
    case 'list':
      return (
        <ul {...common} style={{ ...para, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(block.items ?? []).map((item, i) => (
            <li key={i}>
              <Runs runs={item} />
            </li>
          ))}
        </ul>
      );
    default:
      return (
        <p {...common} style={para}>
          <Runs runs={block.runs} />
        </p>
      );
  }
}

export function TeachingBlocks({ blocks, fontSize }: { blocks: TeachingBlock[]; fontSize: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13, color: 'var(--ink-900)' }}>
      {blocks.map((b, i) => (
        <Block key={i} block={b} index={i} fontSize={fontSize} />
      ))}
    </div>
  );
}
