import { 
  H1, 
  H2, 
  H3, 
  H4, 
  P, 
  Blockquote, 
  Code, 
  Muted, 
  Small, 
  Large, 
  Lead 
} from "@/components/ui/typography";
import { type Meta, type StoryObj } from "@storybook/nextjs-vite";

const meta: Meta = {
  title: "UI/Typography",
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component: 
          "A collection of typography components for consistent text styling across the application. " +
          "Includes headings (H1-H4), paragraphs, blockquotes, code, and specialized text styles. " +
          "All components are built with Tailwind CSS and support custom className and style props.",
      },
    },
  },
};

export default meta;

type Story = StoryObj;

/**
 * All heading levels displayed together.
 */
export const Headings: Story = {
  render: () => (
    <div className="space-y-4">
      <H1>Heading 1</H1>
      <H2>Heading 2</H2>
      <H3>Heading 3</H3>
      <H4>Heading 4</H4>
    </div>
  ),
};

/**
 * H1 - Largest heading with centered text.
 */
export const Heading1: Story = {
  render: () => (
    <H1>Welcome to Video Conferencing</H1>
  ),
};

/**
 * H2 - Section heading with bottom border.
 */
export const Heading2: Story = {
  render: () => (
    <H2>Getting Started</H2>
  ),
};

/**
 * H3 - Subsection heading.
 */
export const Heading3: Story = {
  render: () => (
    <H3>Join a Room</H3>
  ),
};

/**
 * H4 - Small heading.
 */
export const Heading4: Story = {
  render: () => (
    <H4>Room Settings</H4>
  ),
};

/**
 * Standard paragraph text.
 */
export const Paragraph: Story = {
  render: () => (
    <P>
      This is a paragraph of text. It has comfortable line height and spacing 
      for easy reading. Multiple paragraphs will have proper spacing between them.
    </P>
  ),
};

/**
 * Lead paragraph for introductions.
 */
export const LeadText: Story = {
  render: () => (
    <Lead>
      Create or join video conference rooms with ease. Connect with your team 
      from anywhere in the world.
    </Lead>
  ),
};

/**
 * Large text for emphasis.
 */
export const LargeText: Story = {
  render: () => (
    <Large>This is large text for emphasis</Large>
  ),
};

/**
 * Small text for fine print.
 */
export const SmallText: Story = {
  render: () => (
    <Small>This is small text</Small>
  ),
};

/**
 * Muted text for secondary information.
 */
export const MutedText: Story = {
  render: () => (
    <Muted>This is muted text for less important information</Muted>
  ),
};

/**
 * Blockquote for quoted text.
 */
export const BlockquoteExample: Story = {
  render: () => (
    <Blockquote>
      &ldquo;The best way to predict the future is to invent it.&rdquo;
      <br />
      — Alan Kay
    </Blockquote>
  ),
};

/**
 * Inline code.
 */
export const InlineCode: Story = {
  render: () => (
    <P>
      Use the <Code>npm run dev</Code> command to start the development server.
    </P>
  ),
};

/**
 * Complete article layout example.
 */
export const ArticleLayout: Story = {
  render: () => (
    <article className="max-w-2xl mx-auto space-y-6">
      <H1>Video Conferencing Platform</H1>
      
      <Lead>
        A modern, real-time video conferencing solution built with Next.js and WebRTC.
      </Lead>
      
      <H2>Features</H2>
      
      <P>
        Our platform provides high-quality video and audio conferencing with a suite 
        of collaboration tools designed for modern teams.
      </P>
      
      <H3>Core Capabilities</H3>
      
      <P>
        The platform supports HD video streaming, screen sharing, and real-time chat. 
        You can use the <Code>useRoom</Code> hook to manage room state and 
        participant interactions.
      </P>
      
      <Blockquote>
        &ldquo;This is the most intuitive video conferencing tool we&apos;ve used. The interface 
        is clean and the performance is exceptional.&rdquo;
      </Blockquote>
      
      <H3>Getting Started</H3>
      
      <P>
        To create a new room, simply click the &ldquo;New Room&rdquo; button. You can then 
        share the room link with participants.
      </P>
      
      <Muted>
        Note: All video calls are encrypted end-to-end for maximum security.
      </Muted>
    </article>
  ),
};

/**
 * Custom styled typography.
 */
export const CustomStyling: Story = {
  render: () => (
    <div className="space-y-4">
      <H2 className="text-blue-600">Custom Blue Heading</H2>
      <P className="text-green-700">Custom green paragraph</P>
      <Code className="bg-purple-100 text-purple-900">Custom code style</Code>
      <Large className="text-red-600 font-bold">Custom large bold text</Large>
    </div>
  ),
};

/**
 * Text alignment examples.
 */
export const TextAlignment: Story = {
  render: () => (
    <div className="space-y-4 max-w-xl">
      <H3 className="text-left">Left Aligned (default for H3)</H3>
      <H3 className="text-center">Center Aligned</H3>
      <H3 className="text-right">Right Aligned</H3>
      <P className="text-justify">
        This is justified text. It will align to both the left and right margins, 
        creating a clean, professional appearance. This is often used in formal 
        documents and publications.
      </P>
    </div>
  ),
};

/**
 * All typography components showcase.
 */
export const AllComponents: Story = {
  render: () => (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Small className="text-muted-foreground">HEADINGS</Small>
        <H1>Heading 1</H1>
        <H2>Heading 2</H2>
        <H3>Heading 3</H3>
        <H4>Heading 4</H4>
      </div>
      
      <div>
        <Small className="text-muted-foreground">BODY TEXT</Small>
        <Lead>Lead paragraph text</Lead>
        <P>Regular paragraph text</P>
        <Large>Large text</Large>
        <Muted>Muted text</Muted>
        <Small>Small text</Small>
      </div>
      
      <div>
        <Small className="text-muted-foreground">SPECIAL</Small>
        <Code>Inline code</Code>
        <Blockquote>This is a blockquote</Blockquote>
      </div>
    </div>
  ),
};
