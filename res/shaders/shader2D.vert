#version 430 core

in layout(location = 0) vec3 position;
in layout(location = 1) vec3 normal_in;
in layout(location = 2) vec2 textureCoordinates_in;

uniform layout(location = 3) mat4 orthoProjection;

//out vec2 textureCoordinates;

out VS_OUT {
	vec2 textureCoordinates;
} vs_out;

void main()
{
	gl_Position = orthoProjection * vec4(position, 1.0f);
	vs_out.textureCoordinates = textureCoordinates_in;
}
