/**
 * TasksPage Add-Task modal tests.
 *
 * Covers the Modal-primitive migration for
 * `src/layers/l6-ui/components/pages/TasksPage.tsx`: the handwritten Add-Task
 * overlay (`styles.modalOverlay` = position:fixed + rgba backdrop) was replaced
 * with the shared <Modal> primitive (Modal.Header / Modal.Content / Modal.Footer)
 * at size="md", zIndex=1100, default closeOnEscape/closeOnBackdropClick (Esc is
 * an additive behaviour — the old modal had none).
 *
 * Pattern (mirrors Dashboard.test.tsx): the page imports the PRODUCTION `useStore`
 * singleton + dispatches via `window.api`, so we seed the singleton directly and
 * use `setupTestEnv()` for the window.api stub. MemoryRouter (TasksPage calls
 * useNavigate) + ModalStackProvider (MANDATORY — both <Modal> and the page's
 * useKeymap consume ModalStackContext; without the provider they throw).
 *
 * RichTextEditor mounts TipTap/ProseMirror (fragile under jsdom) → mocked to a
 * plain <textarea> stub (per EventFormModal.test.tsx). The page imports it from
 * the `../shared` barrel.
 *
 * Load-bearing behaviour pinned (behaviour-preserving migration):
 *  - Clicking "Add Task" opens the dialog (role="dialog" present, fields render).
 *  - Create Task is disabled until title.trim() AND course are both set
 *    (the preserved `!newTaskTitle.trim() || !newTaskCourseId` predicate).
 *  - Clicking Create dispatches 'CreateTask' with the expected payload, THEN
 *    closes (fields reset + modal close happen after the awaited dispatch).
 *  - Cancel closes WITHOUT dispatching.
 *  - Esc closes (via the primitive) exactly once, WITHOUT dispatching.
 *  - Backdrop click closes WITHOUT dispatching.
 */

import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

// ---------------------------------------------------------------------------
// RichTextEditor mock — replace TipTap (ProseMirror, fragile under jsdom) with a
// plain textarea honouring the value/onChange contract. The page imports it via
// the `../shared` barrel, but Jest resolves module mocks by resolved path, so
// mocking the deep `shared/RichTextEditor` module intercepts the barrel's
// re-export too (the same approach EventFormModal.test.tsx uses) — and crucially
// avoids `requireActual`-ing the barrel, which would still evaluate the real
// TipTap module.
// ---------------------------------------------------------------------------
jest.mock('../../../src/layers/l6-ui/components/shared/RichTextEditor', () => ({
  RichTextEditor: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
  }) => (
    <textarea
      data-testid="rich-text-editor"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// Import AFTER the mock so the page picks up the stubbed RichTextEditor.
import { ModalStackProvider } from '../../../src/layers/l6-ui/contexts/ModalStackContext';
import { TasksPage } from '../../../src/layers/l6-ui/components/pages/TasksPage';
import { useStore } from '../../../src/layers/l5-presentation/store';
import { setupTestEnv, type TestEnv } from '../../test-utils/testEnv';
import type { Course } from '../../../src/layers/l5-presentation/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 1,
    externalId: 'ext-1',
    code: 'CS101',
    name: 'Intro to CS',
    targetGrade: 85,
    targetGradeSource: 'default',
    assessedGrade: 80,
    currentGrade: 78,
    color: '#FF5733',
    nickname: null,
    isHidden: false,
    lastSyncedAt: '2024-01-15T10:00:00Z',
    enrollmentTermId: null,
    credits: 1.0,
    archivedAt: null,
    archiveSource: null,
    ...overrides,
  };
}

async function renderTasksPage() {
  const result = render(
    <ModalStackProvider>
      <MemoryRouter>
        <TasksPage />
      </MemoryRouter>
    </ModalStackProvider>
  );
  // Settle any mount-time microtasks under act so no "not wrapped in act"
  // warning fires (the jsdom act-guard throws on those).
  await act(async () => {});
  return result;
}

/** Open the Add-Task modal by clicking the page-header "Add Task" button. */
async function openModal() {
  const addBtn = screen.getByRole('button', { name: /add task/i });
  await act(async () => {
    fireEvent.click(addBtn);
  });
}

function getDialog(): HTMLElement {
  return screen.getByRole('dialog');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TasksPage — Add-Task modal (Modal-primitive migration)', () => {
  let env: TestEnv;

  beforeEach(() => {
    env = setupTestEnv();
    useStore.setState({ courses: [makeCourse({ id: 1, code: 'CS101' })], tasks: [] });
  });

  afterEach(async () => {
    await act(async () => {
      useStore.setState({ courses: [], tasks: [] });
    });
    env.cleanup();
  });

  it('is closed initially; clicking "Add Task" opens the <Modal> dialog with its fields', async () => {
    await renderTasksPage();

    // Closed initially — no dialog (the primitive renders null when !isOpen).
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await openModal();

    // <Modal> rendered → role="dialog" present (proves the primitive, not the
    // old handwritten overlay).
    const dialog = getDialog();
    expect(dialog).toBeInTheDocument();

    // Modal.Header title.
    expect(within(dialog).getByText('Add Task')).toBeInTheDocument();
    // Fields render: title input, type select(s), date, weight, description stub.
    expect(within(dialog).getByPlaceholderText('Task title')).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText('Weight %')).toBeInTheDocument();
    expect(within(dialog).getByTestId('rich-text-editor')).toBeInTheDocument();
    // Course option from seeded store course renders in the course select.
    expect(within(dialog).getByText(/CS101/)).toBeInTheDocument();
    // Footer buttons.
    expect(within(dialog).getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: /create task/i })
    ).toBeInTheDocument();
  });

  it('disables Create Task until a title AND a course are both set', async () => {
    await renderTasksPage();
    await openModal();
    const dialog = getDialog();

    const createBtn = within(dialog).getByRole('button', {
      name: /create task/i,
    }) as HTMLButtonElement;
    const titleInput = within(dialog).getByPlaceholderText('Task title');
    const courseSelect = within(dialog).getByText('Select course...').closest('select')!;

    // Empty title + no course → disabled.
    expect(createBtn).toBeDisabled();

    // Title only → still disabled (no course).
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'My Task' } });
    });
    expect(createBtn).toBeDisabled();

    // Course only (clear title) → still disabled.
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: '   ' } }); // whitespace → trim() empty
      fireEvent.change(courseSelect, { target: { value: '1' } });
    });
    expect(createBtn).toBeDisabled();

    // Both set → enabled.
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'My Task' } });
    });
    expect(createBtn).toBeEnabled();
  });

  it('dispatches CreateTask with the expected payload, THEN closes the modal', async () => {
    await renderTasksPage();
    await openModal();
    const dialog = getDialog();

    const titleInput = within(dialog).getByPlaceholderText('Task title');
    const weightInput = within(dialog).getByPlaceholderText('Weight %');
    const descInput = within(dialog).getByTestId('rich-text-editor');
    const courseSelect = within(dialog).getByText('Select course...').closest('select')!;
    // The type select is the one holding the "Select type..." option.
    const typeSelect = within(dialog).getByText('Select type...').closest('select')!;
    // The date input.
    const dateInput = dialog.querySelector('input[type="date"]') as HTMLInputElement;

    // Drive every field's onChange so the arrow setters are covered.
    await act(async () => {
      fireEvent.change(courseSelect, { target: { value: '1' } });
      fireEvent.change(titleInput, { target: { value: '  My Task  ' } });
      fireEvent.change(descInput, { target: { value: 'Some description' } });
      fireEvent.change(typeSelect, { target: { value: 'quiz' } });
      fireEvent.change(dateInput, { target: { value: '2026-07-01' } });
      fireEvent.change(weightInput, { target: { value: '25' } });
    });

    const createBtn = within(dialog).getByRole('button', { name: /create task/i });
    await act(async () => {
      fireEvent.click(createBtn);
    });

    // Dispatched exactly once with the expected (trimmed/coerced) payload.
    expect(env.api.dispatch).toHaveBeenCalledTimes(1);
    expect(env.api.dispatch).toHaveBeenCalledWith('CreateTask', {
      courseId: 1,
      title: 'My Task',
      description: 'Some description',
      dueAt: '2026-07-01',
      weight: 25,
      taskType: 'quiz',
    });

    // After the awaited dispatch the modal closes (reset-then-close order).
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('omits optional fields (undefined) when only title + course are provided', async () => {
    await renderTasksPage();
    await openModal();
    const dialog = getDialog();

    const titleInput = within(dialog).getByPlaceholderText('Task title');
    const courseSelect = within(dialog).getByText('Select course...').closest('select')!;

    await act(async () => {
      fireEvent.change(courseSelect, { target: { value: '1' } });
      fireEvent.change(titleInput, { target: { value: 'Bare Task' } });
    });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /create task/i }));
    });

    expect(env.api.dispatch).toHaveBeenCalledTimes(1);
    expect(env.api.dispatch).toHaveBeenCalledWith('CreateTask', {
      courseId: 1,
      title: 'Bare Task',
      description: undefined,
      dueAt: undefined,
      weight: undefined,
      taskType: undefined,
    });
  });

  it('Cancel closes the modal WITHOUT dispatching', async () => {
    await renderTasksPage();
    await openModal();
    const dialog = getDialog();

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }));
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(env.api.dispatch).not.toHaveBeenCalled();
  });

  it('Escape closes the modal exactly once, WITHOUT dispatching (primitive delegation)', async () => {
    await renderTasksPage();
    await openModal();
    expect(getDialog()).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(env.api.dispatch).not.toHaveBeenCalled();
  });

  it('backdrop click closes the modal WITHOUT dispatching', async () => {
    await renderTasksPage();
    await openModal();
    const dialog = getDialog();

    // The backdrop is the dialog's immediately-preceding sibling div (the
    // primitive renders <backdrop /> then <dialog /> inside the same fragment).
    // Targeting the sibling avoids matching the header close-icon's <svg>, which
    // also carries aria-hidden="true".
    const backdrop = dialog.previousElementSibling!;
    expect(backdrop).toHaveAttribute('aria-hidden', 'true');
    await act(async () => {
      fireEvent.click(backdrop);
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(env.api.dispatch).not.toHaveBeenCalled();
  });
});
