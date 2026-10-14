// CreativeStudioViewModel.cs - SuperAgent Windows Native WinUI 3
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SuperAgent.Core;
using SuperAgent.Views;

namespace SuperAgent.ViewModels;

public partial class ColorSwatchItem : ObservableObject
{
    [ObservableProperty]
    private string _hex = "#06B6D4";

    [ObservableProperty]
    private string _name = "Cyan";

    [ObservableProperty]
    private double _weight = 0.85;

    public Microsoft.UI.Xaml.Media.SolidColorBrush Brush =>
        CreativeStudioPage.HexToBrush(Hex);
}

public partial class CreativeStudioViewModel : ObservableObject
{
    private readonly CreativeStudioState _state;

    public ObservableCollection<ImageItem> Filmstrip { get; } = new();
    public ObservableCollection<VideoItem> VideoQueue { get; } = new();
    public ObservableCollection<PalettePreset> Palettes { get; } = new();
    public ObservableCollection<ColorSwatchItem> Swatches { get; } = new();

    [ObservableProperty]
    private ImageItem? _activeImage;

    [ObservableProperty]
    private VideoItem? _activeVideo;

    [ObservableProperty]
    private PalettePreset? _selectedPalette;

    [ObservableProperty]
    private WatermarkConfig _watermark = new();

    [ObservableProperty]
    private string _imagePrompt = "Futuristic quantum compute laboratory schematic circuit board render";

    [ObservableProperty]
    private string _negativePrompt = "blurry, low quality, artifacts, watermark";

    [ObservableProperty]
    private string _selectedAspectRatio = "16:9";

    [ObservableProperty]
    private string _selectedEngine = "Flux.1 Dev";

    [ObservableProperty]
    private double _steps = 28;

    [ObservableProperty]
    private double _cfgScale = 7.0;

    [ObservableProperty]
    private double _paletteWeight = 0.85;

    [ObservableProperty]
    private string _selectedVideoEngine = "Wan2.1-T2V-14B";

    [ObservableProperty]
    private string _selectedResolution = "1080p";

    [ObservableProperty]
    private int _videoFps = 30;

    [ObservableProperty]
    private string _videoPrompt = "FPV drone cinematic flythrough of a futuristic neon data center";

    [ObservableProperty]
    private string _enhancedPrompt = string.Empty;

    [ObservableProperty]
    private bool _isEnhancing;

    [ObservableProperty]
    private bool _isGenerating;

    [ObservableProperty]
    private string _statusBanner = "Creative Studio Ready (GPU VRAM: 24GB Allocated)";

    public CreativeStudioViewModel(CreativeStudioState? state = null)
    {
        _state = state ?? DemoData.GetCreativeStudioDemo();
        LoadState();
    }

    private void LoadState()
    {
        Filmstrip.Clear();
        foreach (var img in _state.Filmstrip)
        {
            Filmstrip.Add(img);
        }
        ActiveImage = _state.ActiveImage ?? Filmstrip.FirstOrDefault();

        VideoQueue.Clear();
        foreach (var vid in _state.VideoQueue)
        {
            VideoQueue.Add(vid);
        }
        ActiveVideo = _state.ActiveVideo ?? VideoQueue.FirstOrDefault();

        Palettes.Clear();
        foreach (var pal in _state.Palettes)
        {
            Palettes.Add(pal);
        }
        SelectedPalette = Palettes.FirstOrDefault();
        Watermark = _state.Watermark;
        UpdateSwatches(SelectedPalette);
    }

    partial void OnSelectedPaletteChanged(PalettePreset? value)
    {
        UpdateSwatches(value);
    }

    private void UpdateSwatches(PalettePreset? palette)
    {
        Swatches.Clear();
        if (palette == null) return;

        PaletteWeight = palette.Weight;
        foreach (var hex in palette.Colors)
        {
            Swatches.Add(new ColorSwatchItem
            {
                Hex = hex,
                Name = ResolveColorName(hex),
                Weight = palette.Weight
            });
        }
    }

    private static string ResolveColorName(string hex)
    {
        return hex.ToUpperInvariant() switch
        {
            "#06B6D4" => "Cyber Cyan",
            "#8B5CF6" => "Electric Violet",
            "#EC4899" => "Neon Magenta",
            "#3B82F6" => "Pulse Blue",
            "#F59E0B" => "Amber Ember",
            "#EF4444" => "Crimson Core",
            "#7C3AED" => "Deep Violet",
            "#1E1B4B" => "Obsidian Violet",
            "#0D9488" => "Dark Teal",
            "#111827" => "Void Black",
            "#14B8A6" => "Mint Neon",
            "#374151" => "Graphite",
            "#090D16" => "Obsidian Deep",
            "#334155" => "Slate Gray",
            "#94A3B8" => "Silver Metal",
            "#F8FAFC" => "Pure White",
            _ => hex
        };
    }

    [RelayCommand]
    public void SelectImage(ImageItem image)
    {
        ActiveImage = image;
        ImagePrompt = image.Prompt;
        SelectedAspectRatio = image.AspectRatio;
        SelectedEngine = image.Engine;
        StatusBanner = $"Viewing generated image {image.Id} ({image.AspectRatio}, {image.Engine})";
    }

    [RelayCommand]
    public void SetAspectRatio(string ar)
    {
        SelectedAspectRatio = ar;
        StatusBanner = $"Canvas aspect ratio adjusted to {ar}";
    }

    [RelayCommand]
    public void SetEngine(string engine)
    {
        SelectedEngine = engine;
        StatusBanner = $"Active diffusion engine switched to {engine}";
    }

    [RelayCommand]
    public void SetWatermarkAnchor(string anchor)
    {
        Watermark = Watermark with { AnchorPlacement = anchor };
        StatusBanner = $"Watermark anchor shifted to {anchor}";
    }

    [RelayCommand]
    public void SetVideoEngine(string engine)
    {
        SelectedVideoEngine = engine;
        StatusBanner = $"Video engine set to {engine}";
    }

    [RelayCommand]
    public void SetResolution(string res)
    {
        SelectedResolution = res;
        StatusBanner = $"Video resolution set to {res}";
    }

    [RelayCommand]
    public void SetVideoFps(int fps)
    {
        VideoFps = fps;
        StatusBanner = $"Video frame rate set to {fps} fps";
    }

    [RelayCommand]
    public void AppendDescriptor(string descriptor)
    {
        if (string.IsNullOrWhiteSpace(VideoPrompt))
        {
            VideoPrompt = descriptor;
        }
        else if (!VideoPrompt.Contains(descriptor))
        {
            VideoPrompt = $"{VideoPrompt.TrimEnd().TrimEnd(',')}, {descriptor}";
        }
        StatusBanner = $"Appended cinematographic descriptor: {descriptor}";
    }

    [RelayCommand]
    public async Task GenerateImageAsync()
    {
        if (string.IsNullOrWhiteSpace(ImagePrompt)) return;

        IsGenerating = true;
        StatusBanner = $"Dispatching generation to {SelectedEngine} ({Steps} steps)...";
        await Task.Delay(400);

        var newImg = new ImageItem
        {
            Prompt = ImagePrompt.Trim(),
            AspectRatio = SelectedAspectRatio,
            Engine = SelectedEngine,
            Seed = System.Random.Shared.Next(100000, 999999),
            Steps = (int)Steps,
            CfgScale = CfgScale,
            PaletteName = SelectedPalette?.Name ?? "Custom",
            PreviewHex = SelectedPalette?.Colors?.FirstOrDefault() ?? "#1E1B4B"
        };

        Filmstrip.Insert(0, newImg);
        ActiveImage = newImg;
        IsGenerating = false;
        StatusBanner = $"Image {newImg.Id} generated successfully via {SelectedEngine}.";
    }

    [RelayCommand]
    public async Task EnhanceVideoPromptAsync()
    {
        if (string.IsNullOrWhiteSpace(VideoPrompt)) return;

        IsEnhancing = true;
        StatusBanner = "Calling /api/videos/prompt/enhance via cinematographic LLM pipeline...";
        await Task.Delay(300);

        EnhancedPrompt = $"Ultra-smooth 8k cinematic shot of {VideoPrompt.Trim()}, photorealistic volumetric lighting, anamorphic reflections, 60fps pan shot.";
        IsEnhancing = false;
        StatusBanner = "Video prompt enhanced with cinematographic descriptors.";
    }

    [RelayCommand]
    public async Task GenerateVideoAsync()
    {
        IsGenerating = true;
        StatusBanner = $"Queueing video generation on {SelectedVideoEngine} ({SelectedResolution}, {VideoFps}fps)...";
        await Task.Delay(500);

        var newVid = new VideoItem
        {
            Prompt = VideoPrompt,
            EnhancedPrompt = !string.IsNullOrEmpty(EnhancedPrompt) ? EnhancedPrompt : VideoPrompt,
            DurationSeconds = 6,
            Fps = VideoFps,
            Resolution = SelectedResolution,
            Engine = SelectedVideoEngine,
            HasFfmpeg = true
        };

        VideoQueue.Insert(0, newVid);
        ActiveVideo = newVid;
        IsGenerating = false;
        StatusBanner = $"Video {newVid.Id} rendering complete via FFmpeg pipeline ({SelectedResolution}).";
    }

    [RelayCommand]
    public void SelectPalette(PalettePreset palette)
    {
        SelectedPalette = palette;
        StatusBanner = $"Color conditioning locked to: {palette.Name} (Weight: {palette.Weight})";
    }
}
