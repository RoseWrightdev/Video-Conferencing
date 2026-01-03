import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Kbd, KbdGroup } from '../../components/ui/kbd';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../../components/ui/resizable';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Separator } from '../../components/ui/separator';
import { Switch } from '../../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Textarea } from '../../components/ui/textarea';

// Mock ResizeObserver for Resizable component
global.ResizeObserver = class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
};

// Mock Scroll methods for Select
Element.prototype.scrollIntoView = vi.fn();

describe('UI Components', () => {

    describe('Kbd', () => {
        it('renders correctly', () => {
            render(<Kbd>Ctrl</Kbd>);
            expect(screen.getByText('Ctrl')).toBeDefined();
        });

        it('renders group correctly', () => {
            render(
                <KbdGroup>
                    <Kbd>Ctrl</Kbd>
                    <Kbd>C</Kbd>
                </KbdGroup>
            );
            expect(screen.getByText('Ctrl')).toBeDefined();
            expect(screen.getByText('C')).toBeDefined();
        });
    });

    describe('Resizable', () => {
        it('renders panels correctly', () => {
            render(
                <ResizablePanelGroup direction="horizontal">
                    <ResizablePanel defaultSize={50}>Panel A</ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel defaultSize={50}>Panel B</ResizablePanel>
                </ResizablePanelGroup>
            );
            expect(screen.getByText('Panel A')).toBeDefined();
            expect(screen.getByText('Panel B')).toBeDefined();
        });
    });

    describe('Select', () => {
        it('renders and opens', () => {
            render(
                <Select>
                    <SelectTrigger>
                        <SelectValue placeholder="Select an option" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="opt1">Option 1</SelectItem>
                        <SelectItem value="opt2">Option 2</SelectItem>
                    </SelectContent>
                </Select>
            );

            expect(screen.getByText('Select an option')).toBeDefined();
            const trigger = screen.getByRole('combobox');
            expect(trigger).toBeDefined();
        });
    });

    describe('Separator', () => {
        it('renders correctly', () => {
            render(<Separator orientation="vertical" />);
            const sep = screen.getByRole('none');
            expect(sep).toBeDefined();
        });
    });

    describe('Switch', () => {
        it('renders and toggles', () => {
            const onCheckedChange = vi.fn();
            render(<Switch checked={false} onCheckedChange={onCheckedChange} />);

            const switchEl = screen.getByRole('switch');
            expect(switchEl).toBeDefined();

            fireEvent.click(switchEl);
            expect(onCheckedChange).toHaveBeenCalledWith(true);
        });
    });

    describe('Tabs', () => {
        it('renders and switches tabs', async () => {
            const user = userEvent.setup();
            render(
                <Tabs defaultValue="tab1">
                    <TabsList>
                        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
                        <TabsTrigger value="tab2">Tab 2</TabsTrigger>
                    </TabsList>
                    <TabsContent value="tab1">Content 1</TabsContent>
                    <TabsContent value="tab2">Content 2</TabsContent>
                </Tabs>
            );

            expect(screen.getByText('Tab 1')).toBeDefined();
            expect(screen.getByText('Content 1')).toBeDefined();

            const tab2 = screen.getByText('Tab 2');
            await user.click(tab2);

            expect(await screen.findByText('Content 2')).toBeDefined();
        });
    });

    describe('Textarea', () => {
        it('renders and accepts input', () => {
            render(<Textarea placeholder="Type here" />);

            const area = screen.getByPlaceholderText('Type here');
            expect(area).toBeDefined();

            fireEvent.change(area, { target: { value: 'Hello' } });
            expect((area as HTMLTextAreaElement).value).toBe('Hello');
        });
    });

});
