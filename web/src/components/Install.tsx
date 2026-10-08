'use client';

import { useState } from 'react';
import type { Dictionary } from '@/i18n/types';
import { rich } from '@/lib/rich';
import { CopyButton } from './CopyButton';
import { Segmented } from './Segmented';

interface InstallProps {
  t: Dictionary['install'];
  copy: Dictionary['copy'];
}

const REPO = 'whetstone-dev/network-engineering';

// Highlights the repository inside the command
function Cmd({ cmd }: { cmd: string }) {
  const idx = cmd.indexOf(REPO);
  if (idx < 0) return <>{cmd}</>;
  return (
    <>
      {cmd.slice(0, idx)}
      <span className="t-s">{REPO}</span>
      {cmd.slice(idx + REPO.length)}
    </>
  );
}

export function Install({ t, copy }: InstallProps) {
  const [selected, setSelected] = useState(0);
  const tab = t.tabs[selected];

  return (
    <div className="inst-win reveal">
      <Segmented idPrefix="inst" ariaLabel={t.tablistLabel} selected={selected} onSelect={setSelected} items={t.tabs.map((x) => x.label)} />
      <div className="panel" key={selected} id="inst-panel" role="tabpanel" aria-labelledby={`inst-tab-${selected}`}>
        {tab.blocks.map((b) => (
          <div className="codeblock" key={b.cmd}>
            <pre>
              <span className="t-d"># {b.comment}</span>
              {'\n'}
              <span className="t-d" aria-hidden="true">{b.prompt} </span>
              <Cmd cmd={b.cmd} />
            </pre>
            <CopyButton text={b.cmd} labels={copy} />
          </div>
        ))}
        <p className="hint">{rich(tab.hint)}</p>
      </div>
    </div>
  );
}
