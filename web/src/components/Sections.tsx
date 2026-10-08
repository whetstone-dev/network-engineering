import type { CSSProperties, ReactNode } from 'react';
import type { Dictionary, SectionHead as SectionHeadCopy } from '@/i18n/types';
import { rich } from '@/lib/rich';
import { CopyCommand } from './CopyCommand';
import {
  AlertIcon, BookIcon, ImportIcon, SearchIcon, ShieldIcon, SlashCodeIcon, TopologyIcon,
} from './Icons';

interface HeadProps {
  num: string;
  vlan: number;
  head: SectionHeadCopy;
}

// Section heading with a VLAN-style tag
export function SectionHead({ num, vlan, head }: HeadProps) {
  return (
    <div className="head reveal">
      <div className="eyebrow">
        <span className="vlan-tag"><i aria-hidden="true" />VLAN {vlan}</span>
        {num} · {head.tag}
      </div>
      <h2>{rich(head.title)}</h2>
      {head.sub ? <p className="sub">{rich(head.sub)}</p> : null}
    </div>
  );
}

interface CardProps {
  c: string;
  w?: 'w3' | 'w4';
  i?: number;
  icon: ReactNode;
  title: string;
  body: string;
  children?: ReactNode;
}

function Card({ c, w, i = 0, icon, title, body, children }: CardProps) {
  return (
    <article className={`card reveal ${w ?? ''}`} data-c={c} style={{ '--i': i } as CSSProperties}>
      <div className="ico">{icon}</div>
      <h3>{title}</h3>
      <p>{rich(body)}</p>
      {children}
    </article>
  );
}

// Colors for the 7 OSI layers, from blue (physical) to rose (application)
const LAYER_COLORS = ['blue', 'cyan', 'teal', 'green', 'amber', 'rose', 'violet'];
const CHIP_COLORS = ['teal', 'blue', 'violet', 'amber'];
const CERTAINTY_COLORS = ['green', 'amber', 'rose'];

export function Features({ t }: { t: Dictionary['features'] }) {
  return (
    <div className="bento">
      <Card c="violet" w="w4" icon={<ShieldIcon />} title={t.validate.title} body={t.validate.body}>
        <div className="layers" aria-label="L1–L7">
          {LAYER_COLORS.map((c, i) => <span key={c} data-c={c}>L{i + 1}</span>)}
        </div>
      </Card>
      <Card c="blue" i={1} icon={<TopologyIcon />} title={t.diagram.title} body={t.diagram.body} />
      <Card c="teal" w="w3" icon={<SlashCodeIcon />} title={t.configs.title} body={t.configs.body}>
        <div className="mini-code">
          <span className="t-d">! R1 — cisco 2911 (IOS)</span>{'\n'}
          <span className="t-s">interface</span> GigabitEthernet0/0.10{'\n'}
          {' '}<span className="t-s">encapsulation</span> dot1Q 10{'\n'}
          {' '}<span className="t-s">ip address</span> 192.168.10.1 255.255.255.0{'\n'}
          <span className="t-s">ip dhcp pool</span> SALES{'\n'}
          {' '}<span className="t-s">default-router</span> 192.168.10.1
        </div>
      </Card>
      <Card c="amber" w="w3" i={1} icon={<AlertIcon />} title={t.honest.title} body={t.honest.body}>
        <div className="chips">
          {t.honest.chips.map((chip, i) => <span key={chip} className="chip" data-c={CHIP_COLORS[i]}>{chip}</span>)}
        </div>
      </Card>
      <Card c="green" icon={<BookIcon />} title={t.edu.title} body={t.edu.body}>
        <div className="levels">
          {['BEGINNER', 'INTERMEDIATE', 'ADVANCED'].map((l, i) => <span key={l} data-c={['green', 'amber', 'rose'][i]}>{l}</span>)}
        </div>
      </Card>
      <Card c="cyan" i={1} icon={<ImportIcon />} title={t.import.title} body={t.import.body} />
      <Card c="rose" i={2} icon={<SearchIcon />} title={t.analyze.title} body={t.analyze.body}>
        <div className="certainty">
          {t.analyze.rows.map((r, i) => (
            <div key={r.level} data-c={CERTAINTY_COLORS[i]}><b>{r.level}</b>{r.text}</div>
          ))}
        </div>
      </Card>
    </div>
  );
}

const GROUP_COLORS = ['blue', 'teal', 'violet', 'amber'];

export function Toolkit({ t, copy }: { t: Dictionary['toolkit']; copy: Dictionary['copy'] }) {
  return (
    <>
      <div className="tk">
        {t.groups.map((g, i) => (
          <div className="tk-group reveal" key={g.title} data-c={GROUP_COLORS[i]} style={{ '--i': i } as CSSProperties}>
            <h3><i aria-hidden="true" />{g.title}</h3>
            <p>{g.sub}</p>
            <ul>
              {g.items.map((it) => (
                <li key={it.cmd}><code>{it.cmd}</code><span>{rich(it.desc)}</span></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="tk-note reveal">
        <CopyCommand cmd="node scripts/netlab.ts help" copy={copy} />
        <span>{rich(t.ciNote)}</span>
      </div>
    </>
  );
}

export function Steps({ t }: { t: Dictionary['install'] }) {
  return (
    <div className="steps">
      {t.steps.map((s, i) => (
        <div className="step reveal" key={s.title} style={{ '--i': i } as CSSProperties}>
          <span className="num" aria-hidden="true">{i + 1}</span>
          <h3>{s.title}</h3>
          <p>{rich(s.body)}</p>
        </div>
      ))}
      <div className="reqs reveal" style={{ '--i': 3 } as CSSProperties}>
        {t.reqs.map((r) => <span className="chip" key={r}>{r}</span>)}
      </div>
    </div>
  );
}
