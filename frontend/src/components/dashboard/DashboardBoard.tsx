'use client';

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useState, type ReactNode } from 'react';
import { type DragHandleProps } from './WidgetShell';

export const WIDGET_IDS = [
  'kpi-revenue',
  'kpi-orders',
  'kpi-customers',
  'kpi-approvals',
  'revenue',
  'products',
  'categories',
  'activity',
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

const STORAGE_KEY = 'erp-dashboard-layout-v1';

const SPANS: Record<WidgetId, string> = {
  'kpi-revenue': '',
  'kpi-orders': '',
  'kpi-customers': '',
  'kpi-approvals': '',
  revenue: 'md:col-span-2',
  products: 'md:col-span-2',
  categories: 'md:col-span-2',
  activity: 'md:col-span-2',
};

const TITLES: Record<WidgetId, string> = {
  'kpi-revenue': 'Total Revenue',
  'kpi-orders': "Today's Orders",
  'kpi-customers': 'Total Customers',
  'kpi-approvals': 'Pending Approvals',
  revenue: 'Revenue Analytics',
  products: 'Top Selling Products',
  categories: 'Sales by Category',
  activity: 'Recent Activity',
};

function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === 'string' && (WIDGET_IDS as readonly string[]).includes(value);
}

function loadOrder(): WidgetId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const next = Array.isArray(parsed) ? parsed.filter(isWidgetId) : [];
    for (const id of WIDGET_IDS) {
      if (!next.includes(id)) {
        next.push(id);
      }
    }
    return next;
  } catch {
    return [...WIDGET_IDS];
  }
}

function SortableSlot({
  id,
  className,
  children,
}: {
  id: WidgetId;
  className: string;
  children: (handleProps: DragHandleProps) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${className} ${isDragging ? 'z-20 opacity-60' : ''}`}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

export function DashboardBoard({ render }: { render: (id: WidgetId, handleProps: DragHandleProps) => ReactNode }) {
  const [order, setOrder] = useState<WidgetId[]>([...WIDGET_IDS]);
  const [ready, setReady] = useState(false);
  const [activeId, setActiveId] = useState<WidgetId | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    setOrder(loadOrder());
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    }
  }, [order, ready]);

  function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }
    setOrder((items) => {
      const oldIndex = items.indexOf(active.id as WidgetId);
      const newIndex = items.indexOf(over.id as WidgetId);
      if (oldIndex < 0 || newIndex < 0) {
        return items;
      }
      return arrayMove(items, oldIndex, newIndex);
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(event: DragStartEvent) => setActiveId(isWidgetId(event.active.id) ? event.active.id : null)}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={order} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4">
          {order.map((id) => (
            <SortableSlot key={id} id={id} className={SPANS[id]}>
              {(handleProps) => render(id, handleProps)}
            </SortableSlot>
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeId ? (
          <div className="rounded-2xl border border-indigo-200 bg-white/95 px-4 py-3 text-sm font-semibold text-slate-800 shadow-xl dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
            {TITLES[activeId]}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
