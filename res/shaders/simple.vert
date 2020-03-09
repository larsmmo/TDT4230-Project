#version 430 core

in layout(location = 0) vec3 position;
in layout(location = 1) vec3 normal_in;
in layout(location = 2) vec2 textureCoordinates_in;
in layout(location = 3) vec3 tangents_in;
in layout(location = 4) vec3 bitangents_in;

uniform layout(location = 3) mat4 MVP;
uniform layout(location = 4) mat4 model;
uniform layout(location = 5) mat3 normalMatrix;

uniform float elapsedTime;

//out vec2 textureCoordinates;

out VS_OUT {
	vec3 normal;
	vec2 textureCoordinates;
	vec3 fragPos;
	mat3 TBN;
} vs_out;

void main()
{
	/*		IGNORE----------------------------------------------------------------------------
	// Just messing around with transformations, not relevant for assignment
	float alpha = max(0.0f, sin(elapsedTime));

	mat4 translate1 = mat4(0.2, 0.0, 0.0, -0.2, 
						   0.0, 0.2, 0.0, 0.0, 
						   0.0, 0.0, 0.2,  -0.2,  
						   0.0, 0.0, 0.0,  1.0);

	mat4 translate2 = mat4(1.0, 0.0, 0.0, 0.2, 
                  0.0, 1.0, 0.0, 0.0, 
                  0.0, 0.0, 1.0,  0.2,  
                  0.0, 0.0, 0.0,  1.0);

	mat4 rot = mat4(cos(elapsedTime),		0,		sin(elapsedTime),		0,
			 				 0,		1.0,			 0,		0,
					-sin(elapsedTime),	0,		cos(elapsedTime),		0,
							 0, 	0,				 0,		1);

	gl_Position = MVP * rot * vec4(position, 1.0);
	STOP IGNORE------------------------------------------------------------------------       */

    vs_out.normal = normalize(normalMatrix * normal_in);
    vs_out.textureCoordinates = textureCoordinates_in;
	vs_out.fragPos = vec3(model * vec4(position, 1.0));
	gl_Position = MVP * vec4(position, 1.0f);

	// Create TBN matrix for converting vectors from tangent space to model space
	vs_out.TBN = mat3(
		normalize(tangents_in),
		normalize(bitangents_in),
		normalize(normal_in)
		);
}
