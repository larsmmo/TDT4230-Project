#version 430 core

in layout(location = 0) vec3 position;
in layout(location = 1) vec3 normal_in;
in layout(location = 2) vec2 textureCoordinates_in;

uniform layout(location = 3) mat4 MVP;
uniform layout(location = 4) mat4 model;
uniform layout(location = 5) mat3 normalMatrix;

out layout(location = 0) vec3 normal_out;
out layout(location = 1) vec2 textureCoordinates_out;
out layout(location = 2) vec3 fragPos;

void main()
{
    normal_out = normalize(normalMatrix * normal_in);
    textureCoordinates_out = textureCoordinates_in;
	fragPos = vec3(model * vec4(position, 1.0));
	gl_Position = MVP * vec4(position, 1.0f);
}
