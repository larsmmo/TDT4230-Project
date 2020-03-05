#version 430 core

in layout(location = 0) vec3 position;
in layout(location = 1) vec3 normal_in;
in layout(location = 2) vec2 textureCoordinates_in;

uniform layout(location = 3) mat4 MVP;
uniform layout(location = 4) mat4 model;
uniform layout(location = 5) mat3 normalMatrix;

//out vec2 textureCoordinates;

out VS_OUT {
	vec3 normal;
	vec2 textureCoordinates;
	vec3 fragPos;
} vs_out;

void main()
{
    vs_out.normal = normalize(normalMatrix * normal_in);
    vs_out.textureCoordinates = textureCoordinates_in;
	vs_out.fragPos = vec3(model * vec4(position, 1.0));
	gl_Position = MVP * vec4(position, 1.0f);
}
