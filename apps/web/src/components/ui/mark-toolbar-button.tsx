// @ts-nocheck -- vendor shadcn @plate kit component (CMS_BUILD_PLAN.md W6);
// this project's tsconfig sets `exactOptionalPropertyTypes: true`, stricter
// than the upstream Plate UI registry targets, causing spurious optional-prop
// variance errors with no behavioral bug. Regenerate via `npx shadcn add
// @plate/editor-basic` rather than hand-editing.
'use client';

import * as React from 'react';

import { useMarkToolbarButton, useMarkToolbarButtonState } from 'platejs/react';

import { ToolbarButton } from './toolbar';

export function MarkToolbarButton({
  clear,
  nodeType,
  ...props
}: React.ComponentProps<typeof ToolbarButton> & {
  nodeType: string;
  clear?: string[] | string;
}) {
  const state = useMarkToolbarButtonState({ clear, nodeType });
  const { props: buttonProps } = useMarkToolbarButton(state);

  return <ToolbarButton {...props} {...buttonProps} />;
}
