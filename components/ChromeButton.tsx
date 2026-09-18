'use client';

import type {ButtonHTMLAttributes} from 'react';
import {ControlTooltip} from '@/components/ui/tooltip';

/** Window and panel tools share the same hover/keyboard description. */
export function ChromeButton({title, ...props}: ButtonHTMLAttributes<HTMLButtonElement> & {title:string}) {
  return <ControlTooltip label={title}><button type="button" {...props} aria-label={props['aria-label'] || title}/></ControlTooltip>;
}
