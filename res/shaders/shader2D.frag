#version 430 core

in VS_OUT {
	vec2 textureCoordinates;
} fs_in;

layout(binding = 10) uniform sampler2D fontTexture;

out vec4 color;

void main()
{
	color = vec4(texture(fontTexture, fs_in.textureCoordinates));
}