import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Sparkles, Globe, MessageCircle, Hash, X, Building, Plus, ChevronDown } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateWorkspaceModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { currentOrg, createWorkspace } = useApp();

  const [brandName, setBrandName] = useState('');
  const [website, setWebsite] = useState('');
  const [cta, setCta] = useState('');
  const [brandVoice, setBrandVoice] = useState('Bold & Precise');
  const [emojiStyle, setEmojiStyle] = useState('moderate');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [newHashtag, setNewHashtag] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const addHashtag = () => {
    const tag = newHashtag.startsWith('#') ? newHashtag : `#${newHashtag}`;
    if (tag.length > 1 && !hashtags.includes(tag)) {
      setHashtags([...hashtags, tag]);
      setNewHashtag('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentOrg?.id) {
      setError('No active organization selected.');
      return;
    }
    if (!brandName.trim()) {
      setError('Brand name is required.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await createWorkspace({
        organizationId: currentOrg.id,
        brandName: brandName.trim(),
        website: website.trim() || undefined,
        cta: cta.trim() || undefined,
        brandVoice: brandVoice.trim() || undefined,
        emojiStyle,
        defaultHashtags: hashtags,
      });

      // Reset & close
      setBrandName('');
      setWebsite('');
      setCta('');
      setHashtags([]);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create workspace.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-[#0c1220] border border-white/10 rounded-3xl max-w-lg w-full p-6 space-y-5 shadow-2xl relative overflow-hidden">
        {/* Glowing Background Accent */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-white text-lg tracking-tight">Create New Workspace</h3>
              <p className="text-slate-400 text-xs mt-0.5">Add a brand workspace to {currentOrg?.name || 'Organization'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs font-semibold">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Brand / Business Name *"
            icon={<Sparkles className="w-4 h-4 text-indigo-400" />}
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="E.g., Jamai Raja Menswear, Acme Corp"
            required
            autoFocus
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Website URL"
              icon={<Globe className="w-4 h-4 text-slate-400" />}
              type="url"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://..."
            />
            <Input
              label="Default Call to Action (CTA)"
              icon={<MessageCircle className="w-4 h-4 text-slate-400" />}
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              placeholder="Shop the collection"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Brand Voice & Tone
              </label>
              <input
                type="text"
                value={brandVoice}
                onChange={(e) => setBrandVoice(e.target.value)}
                placeholder="E.g., Premium, formal, authoritative"
                className="w-full px-3.5 py-2.5 bg-[#080d16] border border-white/5 rounded-xl text-slate-200 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Emoji Preference
              </label>
              <div className="relative">
                <select
                  value={emojiStyle}
                  onChange={(e) => setEmojiStyle(e.target.value)}
                  className="w-full py-2.5 px-3.5 bg-[#080d16] border border-white/5 rounded-xl text-slate-200 text-sm appearance-none focus:outline-none focus:border-indigo-500 transition cursor-pointer"
                >
                  <option value="none">None</option>
                  <option value="minimal">Minimal</option>
                  <option value="moderate">Moderate</option>
                  <option value="heavy">Heavy</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Default Workspace Hashtags
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {hashtags.map((h, i) => (
                <span
                  key={i}
                  className="text-xs px-2.5 py-0.5 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-lg font-semibold flex items-center gap-1"
                >
                  {h}
                  <button
                    type="button"
                    onClick={() => setHashtags(hashtags.filter((_, j) => j !== i))}
                    className="hover:text-rose-400 transition"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                icon={<Hash className="w-4 h-4" />}
                value={newHashtag}
                onChange={(e) => setNewHashtag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addHashtag();
                  }
                }}
                placeholder="#brand_name"
              />
              <Button type="button" variant="secondary" size="md" onClick={addHashtag}>
                Add
              </Button>
            </div>
          </div>

          <div className="pt-2 flex gap-3">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              className="w-1/2"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-1/2"
              isLoading={isSubmitting}
              icon={<Plus className="w-4 h-4" />}
            >
              Create Workspace
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
