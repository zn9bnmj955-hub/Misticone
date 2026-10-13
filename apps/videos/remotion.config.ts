import { Config } from "@remotion/cli/config";

// Software WebGL works everywhere (CI, servers without GPU).
Config.setChromiumOpenGlRenderer("swangle");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
