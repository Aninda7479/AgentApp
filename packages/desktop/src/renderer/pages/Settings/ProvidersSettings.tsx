import React, { useState } from 'react';
import { ProviderConnection, ModelConfig } from './types';
import { ProvidersService } from '../../logic/providers';

/** Props for the providers settings panel. */
interface ProvidersSettingsProps {
  connectedProviders: ProviderConnection[];
  onConnectProvider: (provider: ProviderConnection, models: ModelConfig[]) => void;
  onDisconnectProvider: (providerId: string) => void;
  enrichModel: (raw: any, providerId: string) => ModelConfig;
  /** In-app toast for non-blocking success/info notices (falls back to alert). */
  onToast?: (message: string) => void;
  /** True while the persisted store is still loading — show a skeleton, not empty. */
  bootstrapping?: boolean;
}

export const ProviderLogo: React.FC<{ providerId: string; org?: string; logoUrl?: string; size?: number; className?: string }> = ({
  providerId,
  org,
  logoUrl,
  size = 24,
  className = ''
}) => {
  const [imgError, setImgError] = useState(false);

  const key = (providerId || '').toLowerCase();

  const getBadgeStyleAndIcon = () => {
    if (key.includes('chatgpt') || key.includes('openai')) {
      return {
        bg: 'bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
        svg: (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
            <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
          </svg>
        )
      };
    }
    if (key.includes('claude') || key.includes('anthropic')) {
      return {
        bg: 'bg-amber-600/20 text-amber-700 dark:text-amber-400 border-amber-500/30',
        svg: (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
            <path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
          </svg>
        )
      };
    }
    if (key.includes('google') || key.includes('gemini') || key.includes('vertex')) {
      return {
        bg: 'bg-blue-600/20 text-blue-600 dark:text-blue-400 border-blue-500/30',
        svg: (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
            <path d="M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81" />
          </svg>
        )
      };
    }
    if (key.includes('deepseek')) {
      return {
        bg: 'bg-cyan-600/20 text-cyan-600 dark:text-cyan-400 border-cyan-500/30',
        svg: (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
            <path d="M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45" />
          </svg>
        )
      };
    }
    if (key.includes('omniroute')) {
      return {
        bg: 'bg-indigo-600/20 text-indigo-600 dark:text-indigo-400 border-indigo-500/30',
        svg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <circle cx="12" cy="12" r="9"/>
            <path d="M12 3v18M3 12h18"/>
          </svg>
        )
      };
    }
    if (key.includes('ollama')) {
      return {
        bg: 'bg-slate-600/20 text-slate-800 dark:text-slate-200 border-slate-500/30',
        svg: (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
            <path d="M16.361 10.26a.894.894 0 0 0-.558.47l-.072.148.001.207c0 .193.004.217.059.353.076.193.152.312.291.448.24.238.51.3.872.205a.86.86 0 0 0 .517-.436.752.752 0 0 0 .08-.498c-.064-.453-.33-.782-.724-.897a1.06 1.06 0 0 0-.466 0zm-9.203.005c-.305.096-.533.32-.65.639a1.187 1.187 0 0 0-.06.52c.057.309.31.59.598.667.362.095.632.033.872-.205.14-.136.215-.255.291-.448.055-.136.059-.16.059-.353l.001-.207-.072-.148a.894.894 0 0 0-.565-.472 1.02 1.02 0 0 0-.474.007Zm4.184 2c-.131.071-.223.25-.195.383.031.143.157.288.353.407.105.063.112.072.117.136.004.038-.01.146-.029.243-.02.094-.036.194-.036.222.002.074.07.195.143.253.064.052.076.054.255.059.164.005.198.001.264-.03.169-.082.212-.234.15-.525-.052-.243-.042-.28.087-.355.137-.08.281-.219.324-.314a.365.365 0 0 0-.175-.48.394.394 0 0 0-.181-.033c-.126 0-.207.03-.355.124l-.085.053-.053-.032c-.219-.13-.259-.145-.391-.143a.396.396 0 0 0-.193.032zm.39-2.195c-.373.036-.475.05-.654.086-.291.06-.68.195-.951.328-.94.46-1.589 1.226-1.787 2.114-.04.176-.045.234-.045.53 0 .294.005.357.043.524.264 1.16 1.332 2.017 2.714 2.173.3.033 1.596.033 1.896 0 1.11-.125 2.064-.727 2.493-1.571.114-.226.169-.372.22-.602.039-.167.044-.23.044-.523 0-.297-.005-.355-.045-.531-.288-1.29-1.539-2.304-3.072-2.497a6.873 6.873 0 0 0-.855-.031zm.645.937a3.283 3.283 0 0 1 1.44.514c.223.148.537.458.671.662.166.251.26.508.303.82.02.143.01.251-.043.482-.08.345-.332.705-.672.957a3.115 3.115 0 0 1-.689.348c-.382.122-.632.144-1.525.138-.582-.006-.686-.01-.853-.042-.57-.107-1.022-.334-1.35-.68-.264-.28-.385-.535-.45-.946-.03-.192.025-.509.137-.776.136-.326.488-.73.836-.963.403-.269.934-.46 1.422-.512.187-.02.586-.02.773-.002zm-5.503-11a1.653 1.653 0 0 0-.683.298C5.617.74 5.173 1.666 4.985 2.819c-.07.436-.119 1.04-.119 1.503 0 .544.064 1.24.155 1.721.02.107.031.202.023.208a8.12 8.12 0 0 1-.187.152 5.324 5.324 0 0 0-.949 1.02 5.49 5.49 0 0 0-.94 2.339 6.625 6.625 0 0 0-.023 1.357c.091.78.325 1.438.727 2.04l.13.195-.037.064c-.269.452-.498 1.105-.605 1.732-.084.496-.095.629-.095 1.294 0 .67.009.803.088 1.266.095.555.288 1.143.503 1.534.071.128.243.393.264.407.007.003-.014.067-.046.141a7.405 7.405 0 0 0-.548 1.873c-.062.417-.071.552-.071.991 0 .56.031.832.148 1.279L3.42 24h1.478l-.05-.091c-.297-.552-.325-1.575-.068-2.597.117-.472.25-.819.498-1.296l.148-.29v-.177c0-.165-.003-.184-.057-.293a.915.915 0 0 0-.194-.25 1.74 1.74 0 0 1-.385-.543c-.424-.92-.506-2.286-.208-3.451.124-.486.329-.918.544-1.154a.787.787 0 0 0 .223-.531c0-.195-.07-.355-.224-.522a3.136 3.136 0 0 1-.817-1.729c-.14-.96.114-2.005.69-2.834.563-.814 1.353-1.336 2.237-1.475.199-.033.57-.028.776.01.226.04.367.028.512-.041.179-.085.268-.19.374-.431.093-.215.165-.333.36-.576.234-.29.46-.489.822-.729.413-.27.884-.467 1.352-.561.17-.035.25-.04.569-.04.319 0 .398.005.569.04a4.07 4.07 0 0 1 1.914.997c.117.109.398.457.488.602.034.057.095.177.132.267.105.241.195.346.374.43.14.068.286.082.503.045.343-.058.607-.053.943.016 1.144.23 2.14 1.173 2.581 2.437.385 1.108.276 2.267-.296 3.153-.097.15-.193.27-.333.419-.301.322-.301.722-.001 1.053.493.539.801 1.866.708 3.036-.062.772-.26 1.463-.533 1.854a2.096 2.096 0 0 1-.224.258.916.916 0 0 0-.194.25c-.054.109-.057.128-.057.293v.178l.148.29c.248.476.38.823.498 1.295.253 1.008.231 2.01-.059 2.581a.845.845 0 0 0-.044.098c0 .006.329.009.732.009h.73l.02-.074.036-.134c.019-.076.057-.3.088-.516.029-.217.029-1.016 0-1.258-.11-.875-.295-1.57-.597-2.226-.032-.074-.053-.138-.046-.141.008-.005.057-.074.108-.152.376-.569.607-1.284.724-2.228.031-.26.031-1.378 0-1.628-.083-.645-.182-1.082-.348-1.525a6.083 6.083 0 0 0-.329-.7l-.038-.064.131-.194c.402-.604.636-1.262.727-2.04a6.625 6.625 0 0 0-.024-1.358 5.512 5.512 0 0 0-.939-2.339 5.325 5.325 0 0 0-.95-1.02 8.097 8.097 0 0 1-.186-.152.692.692 0 0 1 .023-.208c.208-1.087.201-2.443-.017-3.503-.19-.924-.535-1.658-.98-2.082-.354-.338-.716-.482-1.15-.455-.996.059-1.8 1.205-2.116 3.01a6.805 6.805 0 0 0-.097.726c0 .036-.007.066-.015.066a.96.96 0 0 1-.149-.078A4.857 4.857 0 0 0 12 3.03c-.832 0-1.687.243-2.456.698a.958.958 0 0 1-.148.078c-.008 0-.015-.03-.015-.066a6.71 6.71 0 0 0-.097-.725C8.997 1.392 8.337.319 7.46.048a2.096 2.096 0 0 0-.585-.041Zm.293 1.402c.248.197.523.759.682 1.388.03.113.06.244.069.292.007.047.026.152.041.233.067.365.098.76.102 1.24l.002.475-.12.175-.118.178h-.278c-.324 0-.646.041-.954.124l-.238.06c-.033.007-.038-.003-.057-.144a8.438 8.438 0 0 1 .016-2.323c.124-.788.413-1.501.696-1.711.067-.05.079-.049.157.013zm9.825-.012c.17.126.358.46.498.888.28.854.36 2.028.212 3.145-.019.14-.024.151-.057.144l-.238-.06a3.693 3.693 0 0 0-.954-.124h-.278l-.119-.178-.119-.175.002-.474c.004-.669.066-1.19.214-1.772.157-.623.434-1.185.68-1.382.078-.062.09-.063.159-.012z" />
          </svg>
        )
      };
    }
    if (key.includes('openrouter')) {
      return {
        bg: 'bg-purple-600/20 text-purple-600 dark:text-purple-400 border-purple-500/30',
        svg: (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
            <path d="M16.778 1.844v1.919q-.569-.026-1.138-.032-.708-.008-1.415.037c-1.93.126-4.023.728-6.149 2.237-2.911 2.066-2.731 1.95-4.14 2.75-.396.223-1.342.574-2.185.798-.841.225-1.753.333-1.751.333v4.229s.768.108 1.61.333c.842.224 1.789.575 2.185.799 1.41.798 1.228.683 4.14 2.75 2.126 1.509 4.22 2.11 6.148 2.236.88.058 1.716.041 2.555.005v1.918l7.222-4.168-7.222-4.17v2.176c-.86.038-1.611.065-2.278.021-1.364-.09-2.417-.357-3.979-1.465-2.244-1.593-2.866-2.027-3.68-2.508.889-.518 1.449-.906 3.822-2.59 1.56-1.109 2.614-1.377 3.978-1.466.667-.044 1.418-.017 2.278.02v2.176L24 6.014Z" />
          </svg>
        )
      };
    }
    if (key.includes('nvidia')) {
      return {
        bg: 'bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
        svg: (
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
            <path d="M8.948 8.798v-1.43a6.7 6.7 0 0 1 .424-.018c3.922-.124 6.493 3.374 6.493 3.374s-2.774 3.851-5.75 3.851c-.398 0-.787-.062-1.158-.185v-4.346c1.528.185 1.837.857 2.747 2.385l2.04-1.714s-1.492-1.952-4-1.952a6.016 6.016 0 0 0-.796.035m0-4.735v2.138l.424-.027c5.45-.185 9.01 4.47 9.01 4.47s-4.08 4.964-8.33 4.964c-.37 0-.733-.035-1.095-.097v1.325c.3.035.61.062.91.062 3.957 0 6.82-2.023 9.593-4.408.459.371 2.34 1.263 2.73 1.652-2.633 2.208-8.772 3.984-12.253 3.984-.335 0-.653-.018-.971-.053v1.864H24V4.063zm0 10.326v1.131c-3.657-.654-4.673-4.46-4.673-4.46s1.758-1.944 4.673-2.262v1.237H8.94c-1.528-.186-2.73 1.245-2.73 1.245s.68 2.412 2.739 3.11M2.456 10.9s2.164-3.197 6.5-3.533V6.201C4.153 6.59 0 10.653 0 10.653s2.35 6.802 8.948 7.42v-1.237c-4.84-.6-6.492-5.936-6.492-5.936z" />
          </svg>
        )
      };
    }
    if (key.includes('kimi') || key.includes('moonshot')) {
      return {
        bg: 'bg-fuchsia-600/20 text-fuchsia-600 dark:text-fuchsia-400 border-fuchsia-500/30',
        svg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        )
      };
    }
    if (key.includes('deepinfra')) {
      return {
        bg: 'bg-amber-600/20 text-amber-600 dark:text-amber-400 border-amber-500/30',
        svg: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
          </svg>
        )
      };
    }
    return {
      bg: 'bg-brand-hover text-brand-textMuted border-brand-border',
      svg: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
          <rect x="4" y="4" width="16" height="16" rx="2"/>
          <rect x="9" y="9" width="6" height="6"/>
          <line x1="9" y1="1" x2="9" y2="4"/>
          <line x1="15" y1="1" x2="15" y2="4"/>
          <line x1="9" y1="20" x2="9" y2="23"/>
          <line x1="15" y1="20" x2="15" y2="23"/>
          <line x1="20" y1="9" x2="23" y2="9"/>
          <line x1="20" y1="15" x2="23" y2="15"/>
          <line x1="1" y1="9" x2="4" y2="9"/>
          <line x1="1" y1="15" x2="4" y2="15"/>
        </svg>
      )
    };
  };

  const badge = getBadgeStyleAndIcon();
  const iconSize = size - 6;

  // Render the vector SVG directly for known providers so it is offline-first and CORS-safe!
  const knownProviders = new Set(['chatgpt', 'openai', 'claude', 'anthropic', 'google', 'gemini', 'vertex', 'ollama', 'deepseek', 'openrouter', 'nvidia', 'omniroute']);
  const isKnown = [...knownProviders].some(p => key.includes(p));

  if (isKnown) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex flex-shrink-0 items-center justify-center rounded-md border ${badge.bg} ${className}`}
        title={providerId}
      >
        <div style={{ width: iconSize, height: iconSize }} className="flex items-center justify-center">
          {badge.svg}
        </div>
      </div>
    );
  }

  const match = POPULAR_PROVIDERS.find(p => key === p.id || key.startsWith(p.id));
  const targetLogoUrl = logoUrl || match?.logoUrl || (org || match?.org ? `https://github.com/${org || match?.org}.png` : undefined);

  if (!imgError && targetLogoUrl) {
    return (
      <img
        src={targetLogoUrl}
        alt={providerId}
        onError={() => setImgError(true)}
        style={{ width: size, height: size }}
        className={`flex-shrink-0 rounded-md object-contain p-0.5 bg-brand-popover/80 border border-brand-border/40 shadow-sm ${className}`}
      />
    );
  }

  const genericIconSize = Math.max(12, Math.round(size * 0.55));
  return (
    <div
      style={{ width: size, height: size }}
      className={`flex flex-shrink-0 items-center justify-center rounded-md border p-1 font-mono text-[10px] font-bold ${badge.bg} ${className}`}
      title={providerId}
    >
      <div style={{ width: genericIconSize, height: genericIconSize }} className="flex items-center justify-center">
        {badge.svg}
      </div>
    </div>
  );
};

const POPULAR_PROVIDERS = [
  { id: 'omniroute', name: 'OmniRoute Local', org: 'omniroute', logoUrl: 'http://127.0.0.1:20128/favicon.ico', desc: 'OmniRoute Local LLM proxy endpoint (http://127.0.0.1:20128/v1)', defaultUrl: 'http://127.0.0.1:20128/v1' },
  { id: 'ollama', name: 'Ollama', org: 'ollama', logoUrl: 'https://ollama.com/public/ollama.png', desc: 'Local model interface (Ollama runner instance)', defaultUrl: 'http://localhost:11434' },
  { id: 'ollama-cloud', name: 'Ollama Cloud', org: 'ollama', logoUrl: 'https://ollama.com/public/ollama.png', desc: 'Ollama Cloud hosted model inference API', defaultUrl: 'https://api.ollama.com' },
  { id: 'claude', name: 'Claude', org: 'anthropic', logoUrl: 'https://www.anthropic.com/favicon.ico', desc: 'Anthropic Claude Developer API platform', defaultUrl: 'https://api.anthropic.com/v1' },
  { id: 'chatgpt', name: 'ChatGPT', org: 'openai', logoUrl: 'https://openai.com/favicon.ico', desc: 'OpenAI Developer platform API access', defaultUrl: 'https://api.openai.com/v1' },
  { id: 'google', name: 'Google', org: 'google', logoUrl: 'https://www.gstatic.com/lamda/images/gemini_sparkle_v002_d473d53047313d46bf3b1.svg', desc: 'Google Gemini Developer models', defaultUrl: 'https://generativelanguage.googleapis.com' },
  { id: 'vertex', name: 'Vertex API', org: 'googlecloudplatform', logoUrl: 'https://cloud.google.com/favicon.ico', desc: 'Google Cloud Vertex platform integration endpoint', defaultUrl: '' },
  { id: 'deepseek', name: 'DeepSeek', org: 'deepseek-ai', logoUrl: 'https://www.deepseek.com/favicon.ico', desc: 'DeepSeek API endpoints and services', defaultUrl: 'https://api.deepseek.com' },
  { id: 'kimi', name: 'Kimi', org: 'moonshot-ai', logoUrl: 'https://www.moonshot.cn/favicon.ico', desc: 'Moonshot AI developer platform provider', defaultUrl: 'https://api.moonshot.cn/v1' },
  { id: 'openrouter', name: 'OpenRouter', org: 'openrouter-ai', logoUrl: 'https://openrouter.ai/favicon.ico', desc: 'Unified open router endpoint broker', defaultUrl: 'https://openrouter.ai/api/v1' },
  { id: 'nvidia', name: 'NVIDIA', org: 'NVIDIA', logoUrl: 'https://build.nvidia.com/favicon.ico', desc: 'NVIDIA NIM inference microservices (OpenAI-compatible)', defaultUrl: 'https://integrate.api.nvidia.com/v1' },
  { id: 'deepinfra', name: 'DeepInfra', org: 'deepinfra', logoUrl: 'https://deepinfra.com/favicon.ico', desc: 'Low cost serverless inference hosting provider', defaultUrl: 'https://api.deepinfra.com/v1' }
];

// Providers that can function without an API key (local / self-hosted). Every
// other popular/known provider needs a credential, so "Add Without Testing"
// must not create a provider that can never actually send a request.
const KEYLESS_PROVIDER_IDS = new Set(['ollama', 'omniroute', 'custom']);

/**
 * Browser-safe fetch for provider connectivity tests. Shared with the other
 * settings screens via ../web-fetch so the web/VPS build routes every provider
 * call through the server-side proxy instead of hitting CORS in the browser.
 */
import { browserSafeFetch } from '../../web-fetch.js';

/** Manages provider connections: list connected providers, connect new ones via modal, and test endpoints. */
export const ProvidersSettings: React.FC<ProvidersSettingsProps> = ({
  connectedProviders,
  onConnectProvider,
  onDisconnectProvider,
  enrichModel,
  onToast,
  bootstrapping = false
}) => {
  const notify = (message: string) => {
    if (onToast) onToast(message);
    else alert(message);
  };
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalProviderId, setModalProviderId] = useState('');
  const [connectionName, setConnectionName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [testingStatus, setTestingStatus] = useState('');
  const [errorDetails, setErrorDetails] = useState('');

  const handleOpenConnectModal = (pId: string, pName: string, defaultUrl: string) => {
    const id = pId === 'custom' ? `custom-${Date.now()}` : pId;
    setModalProviderId(id);
    setConnectionName(pName);
    setBaseUrl(defaultUrl);
    setApiKey('');
    setTestingStatus('');
    setErrorDetails('');
    setIsModalOpen(true);
  };

  const handleTestConnection = async () => {
    setTestingStatus('Testing connection...');
    setErrorDetails('');
    try {
      let rawModels: any[] = [];
      const key = apiKey.trim();
      const url = baseUrl.trim();

      // Validate the Base Endpoint URL up front so a typos/malformed value
      // surfaces as a friendly message instead of a raw fetch/JSON-parse error.
      if (url) {
        let parsed: URL | null = null;
        try {
          parsed = new URL(url);
        } catch {
          parsed = null;
        }
        if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
          throw new Error('That Base Endpoint URL looks invalid. Use a full http(s) URL (e.g. https://api.openai.com/v1).');
        }
      }

      const fmtTokens = (n: number): string => {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
        if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
        return String(n);
      };

      if (modalProviderId === 'ollama') {
        const res = await browserSafeFetch(`${url || 'http://localhost:11434'}/api/tags`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.models ?? []).map((m: any) => ({
          id: m.name, name: m.name,
          contextLimit: m.details?.parameter_size
        }));
      } else if (modalProviderId === 'chatgpt') {
        const base = url || 'https://api.openai.com/v1';
        const res = await browserSafeFetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.id }));
      } else if (modalProviderId === 'deepseek') {
        const base = url || 'https://api.deepseek.com';
        const res = await browserSafeFetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.id }));
      } else if (modalProviderId === 'deepinfra') {
        const base = url || 'https://api.deepinfra.com/v1';
        const res = await browserSafeFetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        const list = Array.isArray(data) ? data : (data.data ?? []);
        rawModels = list.map((m: any) => ({
          id: m.model_name ?? m.id ?? m,
          name: m.model_name ?? m.id ?? m,
          apiType: m.type ?? m.model_type ?? undefined
        }));
      } else if (modalProviderId === 'google') {
        const res = await browserSafeFetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.models ?? []).map((m: any) => ({
          id: m.name.replace('models/', ''),
          name: m.displayName || m.name.replace('models/', ''),
          description: m.description,
          contextLimit: m.inputTokenLimit ? fmtTokens(m.inputTokenLimit) : undefined,
          outputLimit: m.outputTokenLimit ? fmtTokens(m.outputTokenLimit) : undefined
        }));
      } else if (modalProviderId === 'claude') {
        const base = url || 'https://api.anthropic.com/v1';
        const res = await browserSafeFetch(`${base}/models`, {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.display_name ?? m.id }));
      } else if (modalProviderId === 'kimi') {
        const base = url || 'https://api.moonshot.cn/v1';
        const res = await browserSafeFetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({ id: m.id, name: m.id }));
      } else if (modalProviderId === 'openrouter') {
        const res = await browserSafeFetch('https://openrouter.ai/api/v1/models', {
          headers: { Authorization: `Bearer ${key}` }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => {
          const free = ProvidersService.detectFree(m.id, m.name ?? m.id, m.pricing);
          let pricing: any;
          if (!free && m.pricing) {
            const per1M = (s: string) => {
              const n = parseFloat(s);
              return Number.isFinite(n) ? `$${(n * 1_000_000).toFixed(2)}` : String(s);
            };
            pricing = { inputPer1M: per1M(m.pricing.prompt), outputPer1M: per1M(m.pricing.completion) };
          }
          return {
            id: m.id, name: m.name ?? m.id,
            contextLimit: m.context_length ? fmtTokens(m.context_length) : undefined,
            description: m.description,
            free, pricing
          };
        });
      } else if (modalProviderId === 'nvidia') {
        const base = url || 'https://integrate.api.nvidia.com/v1';
        const res = await browserSafeFetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({
          id: m.id, name: m.name ?? m.id,
          contextLimit: m.context_length ? fmtTokens(m.context_length) : undefined,
          description: m.description,
          free: ProvidersService.detectFree(m.id, m.name ?? m.id, m.pricing)
        }));
      } else if (modalProviderId === 'ollama-cloud') {
        const base = url.replace(/\/+$/, '');
        const authHeaders: Record<string, string> = {};
        if (key) authHeaders['Authorization'] = `Bearer ${key}`;

        const res = await browserSafeFetch(`${base}/api/tags`, { headers: authHeaders });
        if (!res.ok) throw new Error(`Ollama Cloud API error [${res.status}]: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.models ?? []).map((m: any) => ({
          id: m.name,
          name: m.name,
          contextLimit: m.details?.parameter_size ? `~${m.details.parameter_size}` : undefined
        }));

        if (!rawModels?.length) {
          throw new Error('Ollama Cloud returned no models. Verify the endpoint is reachable.');
        }

        if (!key) {
          setTestingStatus('Connected (no API key — model listing only, chat will fail without a key)');
        }
      } else {
        const defaultUrl = POPULAR_PROVIDERS.find(p => p.id === modalProviderId)?.defaultUrl || 'https://api.openai.com/v1';
        let base = (url || defaultUrl).replace(/\/+$/, '');
        const headers: Record<string, string> = {};
        if (key) headers['Authorization'] = `Bearer ${key}`;

        let res: Response | null = null;
        try {
          res = await browserSafeFetch(`${base}/models`, { headers });
        } catch (fetchErr: any) {
          // If localhost failed, automatically try 127.0.0.1 fallback for local servers
          if (base.includes('localhost')) {
            const altBase = base.replace('localhost', '127.0.0.1');
            try {
              res = await browserSafeFetch(`${altBase}/models`, { headers });
              base = altBase;
            } catch {
              throw new Error(`Could not reach ${connectionName || modalProviderId} on ${base}. Ensure the local server is running, or use "Add Without Testing".`);
            }
          } else {
            throw new Error(`Could not reach ${connectionName || modalProviderId} on ${base}. Ensure the server is online or check your network connection.`);
          }
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        const data = await res.json();
        rawModels = (data.data ?? []).map((m: any) => ({
          id: m.id, name: m.id,
          free: ProvidersService.detectFree(m.id, m.id, m.pricing)
        }));
      }

      if (rawModels.length === 0) throw new Error('Connection succeeded but no models were returned.');

      const newConfigs: ModelConfig[] = rawModels.map(m => enrichModel(m, modalProviderId));
      const defaultUrl = POPULAR_PROVIDERS.find(p => p.id === modalProviderId)?.defaultUrl || '';

      onConnectProvider({
        id: modalProviderId,
        name: connectionName || modalProviderId,
        type: key ? 'key' : 'custom',
        apiKey: key,
        baseUrl: url || defaultUrl
      }, newConfigs);

      notify(`Connected to ${connectionName} — ${rawModels.length} models imported.`);
      setIsModalOpen(false);
    } catch (e: any) {
      console.error(e);
      const msg = e.message || String(e);
      const cleanMsg = msg === 'Failed to fetch' || msg === 'fetch failed'
        ? `Could not reach ${connectionName || modalProviderId} at ${baseUrl || 'the endpoint'}. Make sure OmniRoute is running locally, or click "Add Without Testing".`
        : msg;
      setErrorDetails(cleanMsg);
      setTestingStatus('Connection failed');
    }
  };

  const handleForceConnect = () => {
    const knownDefaults: Record<string, { id: string; name: string; ctx?: string; free?: boolean }[]> = {
      omniroute: [
        { id: 'oc/big-pickle', name: 'Big Pickle (OpenCode)', ctx: '200k', free: true },
        { id: 'omniroute-auto', name: 'OmniRoute Auto Router', ctx: '128k', free: true },
        { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', ctx: '128k', free: true }
      ],
      ollama:   [{ id: 'llama3.1:8b', name: 'Llama 3.1 8B' }, { id: 'mistral:7b', name: 'Mistral 7B' }],
      chatgpt:  [{ id: 'gpt-4o', name: 'GPT-4o', ctx: '128k' }, { id: 'gpt-4o-mini', name: 'GPT-4o Mini', ctx: '128k' }, { id: 'o3-mini', name: 'o3-mini', ctx: '200k' }],
      deepseek: [{ id: 'deepseek-chat', name: 'DeepSeek Chat', ctx: '64k' }, { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', ctx: '64k' }],
      google:   [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', ctx: '1M' }, { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', ctx: '2M' }, { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', ctx: '1M' }],
      claude:   [{ id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', ctx: '200k' }, { id: 'claude-haiku-3-5', name: 'Claude Haiku 3.5', ctx: '200k' }],
      kimi:     [{ id: 'moonshot-v1-128k', name: 'Moonshot v1 128k', ctx: '128k' }, { id: 'moonshot-v1-32k', name: 'Moonshot v1 32k', ctx: '32k' }],
      openrouter: [{ id: 'openrouter/auto', name: 'Auto Router' }],
      nvidia: [
        { id: 'llama-3.1-nemotron-70b-instruct', name: 'Llama 3.1 Nemotron 70B Instruct', ctx: '128k', free: true },
        { id: 'llama-3.3-nemotron-super-49b-v1', name: 'Llama 3.3 Nemotron Super 49B', ctx: '128k', free: true },
        { id: 'llama-3.1-8b-instruct', name: 'Llama 3.1 8B Instruct', ctx: '128k', free: true }
      ],
      'ollama-cloud': [
        { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', ctx: '128k' },
        { id: 'gemma4:31b', name: 'Gemma 4 31B', ctx: '128k' },
        { id: 'gpt-oss:20b', name: 'GPT-OSS 20B', ctx: '128k' },
        { id: 'qwen3.5:397b', name: 'Qwen 3.5 397B', ctx: '128k' }
      ]
    };

    const defaults = knownDefaults[modalProviderId];
    if (!defaults) {
      notify('No preset models are available for this provider. Connect online to fetch its model list.');
      return;
    }

    // Don't create a provider that can never send a request: key-required
    // providers must have a credential before being added without a test.
    if (!KEYLESS_PROVIDER_IDS.has(modalProviderId) && !apiKey.trim()) {
      setErrorDetails('This provider needs an API key before it can be added. Enter your key, or use "Test & Connect" to verify the connection first.');
      notify('Enter an API key before adding this provider without a test — a provider added with no key can’t send any requests.');
      return;
    }

    const newConfigs: ModelConfig[] = defaults.map(m =>
      enrichModel({ id: m.id, name: m.name, contextLimit: m.ctx, free: m.free }, modalProviderId)
    );

    const defaultUrl = POPULAR_PROVIDERS.find(p => p.id === modalProviderId)?.defaultUrl || '';

    onConnectProvider({
      id: modalProviderId,
      name: connectionName || modalProviderId,
      type: apiKey ? 'key' : 'custom',
      apiKey,
      baseUrl: baseUrl || defaultUrl
    }, newConfigs);

    notify(`Added ${defaults.length} known model(s) for ${connectionName} without testing the connection.`);
    setIsModalOpen(false);
  };

  const visiblePopular = POPULAR_PROVIDERS.filter(
    (p) => !connectedProviders.some((cp) => cp.id === p.id)
  );

  // Resolve a friendly display name for a connected provider: when the user
  // leaves the connection-name blank it defaults to the raw id (e.g. "claude"),
  // so show the catalog's human label ("Claude") instead. A user-set custom
  // name is always preserved.
  const displayName = (p: { id: string; name: string }) =>
    p.name && p.name !== p.id
      ? p.name
      : POPULAR_PROVIDERS.find((x) => x.id === p.id)?.name ?? p.name;

  // Convey credential status, not just provider category. Previously a cloud
  // provider connected without a key read as "Custom", so users couldn't tell
  // which providers actually held credentials. API Key / Env var = has
  // credentials; Local = self-hosted (no key needed); No key = missing creds.
  const credStatus = (
    p: { id: string; type: string }
  ): { label: string; tone: 'constructive' | 'muted' | 'attention' } => {
    if (p.type === 'key') return { label: 'API Key', tone: 'constructive' };
    if (p.type === 'env') return { label: 'Env var', tone: 'constructive' };
    if (KEYLESS_PROVIDER_IDS.has(p.id)) return { label: 'Local', tone: 'muted' };
    return { label: 'No key', tone: 'attention' };
  };

  return (
    <div className="mx-auto w-full max-w-3xl text-left">
      <h1 className="font-outfit text-2xl font-semibold tracking-tight text-brand-textMain sm:text-3xl">
        Providers
      </h1>
      <p className="mb-7 mt-2 text-sm leading-relaxed text-brand-textMuted sm:text-base">
        Manage model connections, credentials, and custom endpoint URLs.
      </p>

      {/* Connected Providers List */}
      <section className="mb-8">
        <h3 className="ui-label mb-3">Connected providers</h3>
        {bootstrapping ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading connections">
            {[0, 1].map((i) => (
              <div key={i} className="ui-card flex items-center gap-3 p-3.5 sm:p-4">
                <div className="h-6 w-6 flex-shrink-0 animate-pulse rounded-md bg-brand-hover" />
                <div className="h-3.5 w-40 animate-pulse rounded bg-brand-hover" />
                <div className="ml-auto h-3.5 w-16 animate-pulse rounded bg-brand-hover" />
              </div>
            ))}
          </div>
        ) : connectedProviders.length === 0 ? (
          <div className="ui-card px-6 py-10 text-center text-sm text-brand-textMuted">
            No active API connections. Connect one of the popular providers below.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {connectedProviders.map((p) => (
              <div key={p.id} className="ui-card flex items-center justify-between gap-3 p-3.5 sm:p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <ProviderLogo providerId={p.id} />
                  <span className="truncate text-sm font-semibold text-brand-textMain">{displayName(p)}</span>
                  <span className={`ui-badge ${credStatus(p).tone}`}>{credStatus(p).label}</span>
                </div>
                <button
                  onClick={() => onDisconnectProvider(p.id)}
                  className="ui-btn-ghost text-[color:var(--neon-destructive)] hover:bg-[color:var(--neon-destructive)]/10"
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Popular Providers */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h3 className="ui-label">Popular providers</h3>
          <button onClick={() => handleOpenConnectModal('custom', 'Custom Provider', '')} className="ui-btn">
            + Add Custom Provider
          </button>
        </div>

        {visiblePopular.length === 0 ? (
          <div className="ui-card px-6 py-10 text-center text-sm text-brand-textMuted">
            All popular providers are connected!
          </div>
        ) : (
          <div className="ui-card overflow-hidden">
            {visiblePopular.map((p, idx) => (
              <div
                key={p.id}
                className={`flex items-center justify-between gap-3 p-3.5 sm:p-4 ${
                  idx === visiblePopular.length - 1 ? '' : 'border-b border-brand-border'
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <ProviderLogo providerId={p.id} org={p.org} size={32} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-brand-textMain">{p.name}</div>
                    <div className="truncate text-xs text-brand-textMuted">{p.desc}</div>
                  </div>
                </div>
                <button
                  onClick={() => handleOpenConnectModal(p.id, p.name, p.defaultUrl)}
                  className="ui-btn-primary flex-shrink-0"
                >
                  + Connect
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Connect modal */}
      {isModalOpen && (
        <div
          className="ui-modal-backdrop"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setIsModalOpen(false); }}
        >
          <div className="ui-modal p-5 sm:p-6">
            <div className="mb-4 flex items-center gap-3 text-left">
              <ProviderLogo providerId={modalProviderId} size={32} />
              <h3 className="font-outfit text-lg font-semibold text-brand-textMain">
                Connect {connectionName}
              </h3>
            </div>

            <div className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1 text-left">
                <label className="ui-label" htmlFor="connect-name">Connection Name</label>
                <input
                  id="connect-name"
                  type="text"
                  value={connectionName}
                  onChange={(e) => setConnectionName(e.target.value)}
                  className="ui-input"
                />
              </div>
              <div className="flex flex-col gap-1 text-left">
                <label className="ui-label" htmlFor="connect-key">API Key / Token</label>
                <input
                  id="connect-key"
                  type="password"
                  placeholder="Enter credential token"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="ui-input"
                />
              </div>
              <div className="flex flex-col gap-1 text-left">
                <label className="ui-label" htmlFor="connect-url">Base Endpoint URL</label>
                <input
                  id="connect-url"
                  type="text"
                  placeholder="Defaults to standard URL if empty"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="ui-input"
                />
              </div>
            </div>

            {errorDetails && (
              <div className="ui-state-banner destructive mt-4 px-3 py-2 text-xs leading-relaxed">
                <strong>Connection Error:</strong> {errorDetails}
              </div>
            )}

            {!KEYLESS_PROVIDER_IDS.has(modalProviderId) && !apiKey.trim() && (
              <p className="mt-3 text-[11px] leading-snug text-brand-textMuted">
                Enter an API key above to add {connectionName || modalProviderId} without testing — a provider with no key can’t send requests.
              </p>
            )}
            <div className="mt-5 flex items-center justify-between gap-3">
              <button
                onClick={handleForceConnect}
                disabled={!KEYLESS_PROVIDER_IDS.has(modalProviderId) && !apiKey.trim()}
                title="Add this provider's known models without testing the connection"
                className="ui-btn-ghost text-xs underline-offset-2 hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
              >
                Add Without Testing
              </button>
              <div className="flex gap-2">
                <button onClick={() => setIsModalOpen(false)} className="ui-btn">
                  Cancel
                </button>
                <button
                  onClick={handleTestConnection}
                  disabled={testingStatus === 'Testing connection...'}
                  className="ui-btn-primary"
                >
                  {testingStatus === 'Testing connection...' ? 'Testing...' : 'Test & Connect'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
