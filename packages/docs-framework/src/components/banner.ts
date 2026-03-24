import { escapeHtml } from '../dev/escape-html';

interface BannerProps {
  text: string;
  link?: { label: string; href: string };
  dismissible?: boolean;
}

export function Banner(props: Record<string, unknown>): string {
  const text = String(props.text ?? '');
  const dismissible = props.dismissible === true;
  const link = props.link as BannerProps['link'] | undefined;

  let linkHtml = '';
  if (link?.href) {
    linkHtml = ` <a href="${escapeHtml(link.href)}" style="color:white;text-decoration:underline;font-weight:500">${escapeHtml(link.label)}</a>`;
  }

  let dismissHtml = '';
  if (dismissible) {
    dismissHtml = `<button data-banner-dismiss onclick="this.parentElement.style.display='none';try{localStorage.setItem('banner-dismissed','1')}catch(e){}" style="background:none;border:none;color:white;cursor:pointer;font-size:18px;padding:0 8px;line-height:1">&times;</button>`;
  }

  return `<div data-banner style="display:flex;align-items:center;justify-content:center;gap:8px;padding:8px 16px;background:var(--docs-primary,#2563eb);color:white;font-size:14px"><span>${escapeHtml(text)}${linkHtml}</span>${dismissHtml}</div>`;
}
