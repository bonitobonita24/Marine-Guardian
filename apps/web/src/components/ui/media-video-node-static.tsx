// @ts-nocheck -- vendor shadcn @plate kit component (CMS_BUILD_PLAN.md W6);
// this project's tsconfig sets `exactOptionalPropertyTypes: true`, stricter
// than the upstream Plate UI registry targets, causing spurious optional-prop
// variance errors with no behavioral bug. Regenerate via `npx shadcn add
// @plate/media-kit` rather than hand-editing.
import * as React from 'react';

import type { TCaptionElement, TResizableProps, TVideoElement } from 'platejs';
import type { SlateElementProps } from 'platejs/static';

import { NodeApi } from 'platejs';
import { SlateElement } from 'platejs/static';

export function VideoElementStatic(
  props: SlateElementProps<TVideoElement & TCaptionElement & TResizableProps>
) {
  const { align = 'center', caption, url, width } = props.element;

  return (
    <SlateElement className="py-2.5" {...props}>
      <div style={{ textAlign: align }}>
        <figure
          className="group relative m-0 inline-block cursor-default"
          style={{ width }}
        >
          <div>
            <video
              className="w-full max-w-full rounded-sm object-cover px-0"
              src={url}
              controls
            />
          </div>
          {caption && <figcaption>{NodeApi.string(caption[0])}</figcaption>}
        </figure>
      </div>
      {props.children}
    </SlateElement>
  );
}
