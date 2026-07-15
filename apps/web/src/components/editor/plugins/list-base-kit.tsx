/* eslint-disable @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-misused-spread --
   vendor shadcn @plate kit plugin config (CMS_BUILD_PLAN.md W6); this
   project's ESLint config enables stricter rules than the upstream Plate
   registry targets, with no behavioral bug. Regenerate via
   `npx shadcn add @plate/list-kit` rather than hand-editing. */
import { BaseListPlugin, isOrderedList } from '@platejs/list';
import { KEYS } from 'platejs';

import { BaseIndentKit } from '@/components/editor/plugins/indent-base-kit';
import { BlockListStatic } from '@/components/ui/block-list-static';

export const BaseListKit = [
  ...BaseIndentKit,
  BaseListPlugin.configure({
    inject: {
      nodeProps: {
        nodeKey: KEYS.listType,
        query: ({ nodeProps }) => {
          const element = nodeProps.element;

          return !!element?.listStyleType && !isOrderedList(element);
        },
        transformProps: ({ props }) => ({
          ...props,
          role: 'listitem',
          style: {
            ...props.style,
            display: 'list-item',
          },
        }),
      },
      targetPlugins: [
        ...KEYS.heading,
        KEYS.p,
        KEYS.blockquote,
        KEYS.codeBlock,
        KEYS.toggle,
      ],
    },
    render: {
      belowNodes: BlockListStatic,
    },
  }),
];
