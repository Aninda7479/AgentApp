// CreativeStudioViewModel.cs - SuperAgent Windows Native WinUI 3
using System.Collections.ObjectModel;
using System.Linq;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SuperAgent.Core;

namespace SuperAgent.ViewModels;

public partial class CreativeStudioViewModel : ObservableObject
{
    private readonly CreativeStudioState _state;

    public ObservableCollection<ImageItem> Filmstrip { get; } = new();
    public ObservableCollection<VideoItem> VideoQueue { get; } = new();
    public ObservableCollection<PalettePreset> Palettes { get; } = new();

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
    }

    [RelayCommand]
    public void SelectImage(ImageItem image)
    {
        ActiveImage = image;
        ImagePrompt = image.Prompt;
        SelectedAspectRatio = image.AspectRatio;
        StatusBanner = $"Viewing generated image {image.Id} ({image.AspectRatio}, {image.Engine})";
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
            PreviewHex = "#312E81"
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
        StatusBanner = "Queueing video generation on Wan2.1-T2V-14B...";
        await Task.Delay(500);

        var newVid = new VideoItem
        {
            Prompt = VideoPrompt,
            EnhancedPrompt = !string.IsNullOrEmpty(EnhancedPrompt) ? EnhancedPrompt : VideoPrompt,
            DurationSeconds = 6,
            Fps = 30,
            Resolution = "1080p",
            Engine = "Wan2.1-T2V-14B",
            HasFfmpeg = true
        };

        VideoQueue.Insert(0, newVid);
        ActiveVideo = newVid;
        IsGenerating = false;
        StatusBanner = $"Video {newVid.Id} rendering complete via FFmpeg pipeline.";
    }

    [RelayCommand]
    public void SelectPalette(PalettePreset palette)
    {
        SelectedPalette = palette;
        StatusBanner = $"Color conditioning locked to: {palette.Name} (Weight: {palette.Weight})";
    }
}
